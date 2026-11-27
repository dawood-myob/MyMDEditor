import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { Client, PASSWORD, makeEnv, makeTenant, superadmin, type Env, type Tenant, type Client as C } from './helpers.js';

describe('password hashing', () => {
  it('uses a per-user salt and verifies in constant-time fashion', async () => {
    const a = await hashPassword('Correct-Horse-1', 1024);
    const b = await hashPassword('Correct-Horse-1', 1024);
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$1024$')).toBe(true);
    expect(await verifyPassword('Correct-Horse-1', a)).toBe(true);
    expect(await verifyPassword('correct-horse-1', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('auth', () => {
  let env: Env;
  let sa: C;
  let t: Tenant;

  beforeAll(async () => {
    env = await makeEnv({ LOCKOUT_MAX_FAILURES: '3', LOCKOUT_MINUTES: '5' });
    sa = await superadmin(env);
    t = await makeTenant(env, sa, 'authco');
  });
  afterAll(() => env.close());

  it('bootstraps the superadmin with mustChangePassword and enforces the change', async () => {
    const row = env.ctx.db.get<{ must_change_password: number }>("SELECT must_change_password FROM users WHERE username = 'root'");
    expect(row).toBeDefined();
    env.ctx.db.run("UPDATE users SET must_change_password = 1 WHERE username = 'root'");
    const c = new Client(env);
    const login = await c.login(undefined, 'root', 'Root-Pass-12345');
    expect(login.status).toBe(200);
    expect(login.json.user.mustChangePassword).toBe(true);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    const blocked = await c.get('/api/platform/companies');
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe('forbidden');
    expect(blocked.json.error.details.reason).toBe('password_change_required');

    const wrong = await c.post('/api/auth/change-password', { currentPassword: 'nope-nope-nope', newPassword: 'Another-Pass-1234' });
    expect(wrong.status).toBe(400);
    const weak = await c.post('/api/auth/change-password', { currentPassword: 'Root-Pass-12345', newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect((await c.post('/api/auth/change-password', { currentPassword: 'Root-Pass-12345', newPassword: 'Another-Pass-1234' })).status).toBe(204);
    expect((await c.get('/api/platform/companies')).status).toBe(200);
    // restore for the other tests
    await c.post('/api/auth/change-password', { currentPassword: 'Another-Pass-1234', newPassword: 'Root-Pass-12345' });
  });

  it('login sets an HttpOnly cookie and stores only the token hash', async () => {
    const c = new Client(env);
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'mdhub', 'content-type': 'application/json' },
      payload: JSON.stringify({ company: 'AuthCo', username: 'EDITOR', password: PASSWORD }),
    });
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((x) => x.name === 'mdhub_sid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(String(cookie.sameSite).toLowerCase()).toBe('strict');
    expect(cookie.path).toBe('/');
    expect(cookie.secure).toBeFalsy();
    expect(cookie.value.length).toBeGreaterThanOrEqual(43);
    const rows = env.ctx.db.all<{ id: string }>('SELECT id FROM sessions');
    expect(rows.some((r) => r.id === cookie.value)).toBe(false);
    expect(rows.some((r) => r.id === createHash('sha256').update(cookie.value).digest('hex'))).toBe(true);
    c.cookie = `mdhub_sid=${cookie.value}`;
    const me = await c.get('/api/auth/me');
    expect(me.json.user).toMatchObject({ username: 'editor', role: 'editor', companySlug: 'authco' });
    expect(me.json.user).not.toHaveProperty('passwordHash');
    expect(me.text).not.toContain('scrypt$');
  });

  it('rejects unknown users and wrong passwords with the same error', async () => {
    const c = new Client(env);
    c.ip = '10.1.1.1';
    const a = await c.login('authco', 'ghost');
    const b = await c.login('authco', 'editor', 'wrong-password-1');
    const d = await c.login('no-such-company', 'editor');
    for (const r of [a, b, d]) {
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('invalid_credentials');
    }
    expect(a.json.error.message).toBe(b.json.error.message);
  });

  it('requires the CSRF header on unsafe methods only', async () => {
    const c = new Client(env);
    const noHeader = await c.request('POST', '/api/auth/login', { company: 'authco', username: 'editor', password: PASSWORD }, { csrf: false });
    expect(noHeader.status).toBe(403);
    expect(noHeader.json.error.code).toBe('csrf');
    const wrong = await c.request('POST', '/api/auth/login', { username: 'x', password: 'y' }, { csrf: false, headers: { 'x-requested-with': 'XMLHttpRequest' } });
    expect(wrong.status).toBe(403);
    expect((await c.request('GET', '/api/health', undefined, { csrf: false })).status).toBe(200);
    expect((await t.editor.request('PUT', '/api/documents/00000000-0000-4000-8000-000000000000/content', { content: 'x' }, { csrf: false })).json.error.code).toBe('csrf');
  });

  it('returns 401 without a session and after logout, and invalid JSON is a validation error', async () => {
    const c = new Client(env);
    expect((await c.get('/api/tree')).status).toBe(401);
    expect((await c.get('/api/tree')).json.error.code).toBe('unauthorized');
    await c.login('authco', 'viewer');
    expect((await c.get('/api/tree')).status).toBe(200);
    const saved = c.cookie;
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    c.cookie = saved;
    expect((await c.get('/api/tree')).status).toBe(401);
    const bad = await c.request('POST', '/api/auth/login', undefined, { raw: '{oops', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('validation');
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const c = new Client(env);
    c.ip = '10.2.2.2';
    for (let i = 0; i < 3; i++) expect((await c.login('authco', 'viewer', 'bad-password-123')).status).toBe(401);
    const locked = await c.login('authco', 'viewer', PASSWORD);
    expect(locked.status).toBe(423);
    expect(locked.json.error.code).toBe('account_locked');
    const other = new Client(env);
    other.ip = '10.3.3.3';
    expect((await other.login('authco', 'viewer', PASSWORD)).status).toBe(423);
    expect((await other.login('authco', 'editor', PASSWORD)).status).toBe(200);
  });

  it('rate limits login attempts per IP', async () => {
    const e2 = await makeEnv({ LOGIN_MAX_PER_MIN: '4', LOCKOUT_MAX_FAILURES: '100' });
    try {
      const c = new Client(e2);
      c.ip = '10.9.9.9';
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) codes.push((await c.login('x', `u${i}`, 'whatever-123')).status);
      expect(codes.slice(0, 4).every((s) => s === 401)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    } finally {
      await e2.close();
    }
  });

  it('changing a password revokes other sessions', async () => {
    const a = new Client(env);
    const b = new Client(env);
    await a.login('authco', 'editor');
    await b.login('authco', 'editor');
    expect((await a.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-1' })).status).toBe(204);
    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await b.get('/api/auth/me')).status).toBe(401);
    expect((await a.post('/api/auth/change-password', { currentPassword: 'Brand-New-Pass-1', newPassword: PASSWORD })).status).toBe(204);
  });

  it('expires idle sessions (sliding expiry) and disabled users lose access immediately', async () => {
    const c = new Client(env);
    await c.login('authco', 'viewer', PASSWORD).catch(() => undefined);
    env.ctx.db.run("UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE username = 'viewer'");
    const ok = new Client(env);
    ok.ip = '10.4.4.4';
    expect((await ok.login('authco', 'viewer')).status).toBe(200);
    env.ctx.db.run("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM users WHERE username = 'viewer' AND company_id = ?)", t.id);
    expect((await ok.get('/api/auth/me')).status).toBe(401);

    const ed = new Client(env);
    ed.ip = '10.5.5.5';
    await ed.login('authco', 'editor');
    const editorId = env.ctx.db.get<{ id: string }>("SELECT id FROM users WHERE username = 'editor' AND company_id = ?", t.id)!.id;
    expect((await t.admin.patch(`/api/companies/${t.id}/users/${editorId}`, { disabled: true })).status).toBe(200);
    expect((await ed.get('/api/auth/me')).status).toBe(401);
    const again = new Client(env);
    again.ip = '10.5.5.6';
    expect((await again.login('authco', 'editor')).status).toBe(401);
  });

  it('sets security headers and a structured error shape for unknown routes', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(String(res.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-request-id']).toBeTruthy();
    const nf = await env.app.inject({ method: 'GET', url: '/api/nope' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});

describe('secure cookie', () => {
  it('adds Secure when COOKIE_SECURE=true', async () => {
    const env = await makeEnv({ COOKIE_SECURE: 'true' });
    try {
      const res = await env.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-requested-with': 'mdhub', 'content-type': 'application/json' },
        payload: JSON.stringify({ username: 'root', password: 'Root-Pass-12345' }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.cookies[0]!.secure).toBe(true);
      expect(res.headers['strict-transport-security']).toBeTruthy();
    } finally {
      await env.close();
    }
  });
});
