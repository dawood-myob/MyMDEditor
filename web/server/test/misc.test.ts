import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { unzipSync } from 'fflate';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBackup } from '../src/lib/backup.js';
import { safeSegment } from '../src/storage/mirror.js';
import { sanitizeImportSegment, validateDocumentName, validateFolderName } from '../src/lib/names.js';
import { buildMatchQuery } from '../src/modules/search/service.js';
import { loadConfig } from '../src/config.js';
import { Client, makeEnv, makeTenant, superadmin, waitFor, type Env, type Tenant } from './helpers.js';

describe('SSE /api/events', () => {
  let env: Env;
  let T: Tenant;
  let U: Tenant;
  let port: number;

  beforeAll(async () => {
    env = await makeEnv();
    await env.app.listen({ port: 0, host: '127.0.0.1' });
    port = (env.app.server.address() as AddressInfo).port;
    const sa = await superadmin(env);
    T = await makeTenant(env, sa, 'sse');
    U = await makeTenant(env, sa, 'sseother');
  });
  afterAll(() => env.close());

  it('streams only the caller company events and requires auth', async () => {
    const anon = await fetch(`http://127.0.0.1:${port}/api/events`);
    expect(anon.status).toBe(401);
    await anon.body?.cancel();

    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: { cookie: T.viewer.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    let buf = '';
    const dec = new TextDecoder();
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += dec.decode(value);
      }
    })();
    await waitFor(() => buf.includes('event: ping'));

    await U.editor.post('/api/folders', { parentId: null, name: 'other tenant folder' });
    await new Promise((r) => setTimeout(r, 150));
    expect(buf).not.toContain('event: tree');

    const f = await T.editor.post('/api/folders', { parentId: null, name: 'my folder' });
    expect(f.status).toBe(201);
    await waitFor(() => buf.includes('event: tree'));
    const d = (await T.editor.post('/api/documents', { folderId: null, name: 'evt', content: 'a' })).json.document;
    await T.editor.put(`/api/documents/${d.id}/content`, { content: 'b' });
    await waitFor(() => buf.includes('event: document') && buf.includes(d.id));
    await reader.cancel();
    await pump.catch(() => undefined);
  });
});

describe('static client + SPA fallback', () => {
  it('serves index.html for unknown non-api paths and JSON 404 for api/ws paths', async () => {
    const clientDir = path.join(process.cwd(), '.tmp', `client-${Date.now()}`);
    fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>spa</title>');
    fs.writeFileSync(path.join(clientDir, 'assets', 'app.js'), 'console.log(1)');
    const env = await makeEnv({ CLIENT_DIR: clientDir });
    try {
      const root = await env.app.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('<title>spa</title>');
      const deep = await env.app.inject({ method: 'GET', url: '/some/deep/route?x=1' });
      expect(deep.statusCode).toBe(200);
      expect(deep.body).toContain('<title>spa</title>');
      expect(String(deep.headers['content-type'])).toContain('text/html');
      const asset = await env.app.inject({ method: 'GET', url: '/assets/app.js' });
      expect(asset.statusCode).toBe(200);
      expect(String(asset.headers['cache-control'])).toContain('immutable');
      const api = await env.app.inject({ method: 'GET', url: '/api/unknown' });
      expect(api.statusCode).toBe(404);
      expect(api.json().error.code).toBe('not_found');
      const ws = await env.app.inject({ method: 'GET', url: '/ws/whatever' });
      expect(ws.statusCode).toBe(404);
      expect(ws.headers['content-type']).toContain('application/json');
      expect((await env.app.inject({ method: 'POST', url: '/nope', headers: { 'x-requested-with': 'mdhub' } })).statusCode).toBe(404);
      expect((await env.app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ status: 'ok' });
    } finally {
      await env.close();
      fs.rmSync(clientDir, { recursive: true, force: true });
    }
  });
});

describe('seed', () => {
  it('SEED_DEMO creates the acme tenant with the documented users and documents', async () => {
    const env = await makeEnv({ SEED_DEMO: 'true' });
    try {
      for (const u of ['acme-admin', 'editor', 'viewer']) {
        const c = new Client(env);
        const r = await c.login('acme', u, 'Demo-Pass-1234');
        expect(r.status, u).toBe(200);
        expect(r.json.user.mustChangePassword).toBe(false);
        expect(r.json.user.companyName).toBe('Acme Corp');
      }
      const c = new Client(env);
      await c.login('acme', 'viewer', 'Demo-Pass-1234');
      const tree = (await c.get('/api/tree')).json;
      const names = tree.folders.map((f: { name: string }) => f.name);
      expect(names).toEqual(expect.arrayContaining(['Policies', 'Documentation', 'Help']));
      expect(tree.documents.length).toBeGreaterThanOrEqual(5);
      const sa = new Client(env);
      const login = await sa.login(undefined, 'root', 'Root-Pass-12345');
      expect(login.json.user.mustChangePassword).toBe(true);
      expect((await sa.get('/api/auth/me')).json.user.role).toBe('superadmin');
    } finally {
      await env.close();
    }
  });
});

describe('backup', () => {
  it('writes a consistent SQLite copy and a zip of the company workspaces', async () => {
    const env = await makeEnv();
    try {
      const T = await makeTenant(env, await superadmin(env), 'bk');
      const f = (await T.editor.post('/api/folders', { parentId: null, name: 'Folder' })).json.folder;
      await T.editor.post('/api/documents', { folderId: f.id, name: 'Doc', content: 'backup me' });
      const r = await runBackup(env.ctx.config.dataDir);
      expect(r.database.startsWith(path.join(env.ctx.config.dataDir, 'backups'))).toBe(true);
      const copy = new DatabaseSync(r.database, { readOnly: true });
      try {
        const row = copy.prepare('SELECT content FROM documents WHERE name = ?').get('Doc.md') as { content: string };
        expect(row.content).toBe('backup me');
        expect((copy.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok');
      } finally {
        copy.close();
      }
      const files = unzipSync(new Uint8Array(fs.readFileSync(r.archive)));
      expect(Object.keys(files)).toContain(`${T.id}/workspace/Folder/Doc.md`);
    } finally {
      await env.close();
    }
  });
});

describe('name helpers and search query builder', () => {
  it('sanitises disk segments and import names', () => {
    expect(safeSegment('..')).not.toBe('..');
    expect(safeSegment('a/b\\c')).not.toMatch(/[\\/]/);
    expect(safeSegment('CON')).not.toBe('CON');
    expect(sanitizeImportSegment('a:b*c?.md', true)).toBe('a_b_c_.md'.replace('_.md', '_') + '.md');
    expect(sanitizeImportSegment('', false)).toBe('untitled');
    expect(sanitizeImportSegment('x'.repeat(300), true).length).toBeLessThanOrEqual(120);
  });

  it('validates names', () => {
    expect(validateFolderName(' ok ')).toBe('ok');
    expect(validateDocumentName('Notes')).toBe('Notes.md');
    expect(validateDocumentName('NOTES.MD')).toBe('NOTES.md');
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'x\u0007y', 'con', 'name.', 5, null]) expect(() => validateFolderName(bad as string)).toThrow();
    expect(() => validateDocumentName('..')).toThrow();
    expect(() => validateDocumentName('.md')).toThrow();
  });

  it('builds safe FTS queries', () => {
    expect(buildMatchQuery('')).toBeNull();
    expect(buildMatchQuery('   ')).toBeNull();
    expect(buildMatchQuery('hello wor')).toBe('"hello" "wor"*');
    expect(buildMatchQuery('say "hi"')).toBe('"say" "hi"*');
    expect(buildMatchQuery('***')).toBeNull();
  });

  it('loads config defaults and overrides', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8080);
    expect(c.cookieSecure).toBe(false);
    expect(c.seedDemo).toBe(false);
    const o = loadConfig({ PORT: '9000', COOKIE_SECURE: 'true', SEED_DEMO: 'TRUE', MAX_UPLOAD_MB: '7' });
    expect(o).toMatchObject({ port: 9000, cookieSecure: true, seedDemo: true, maxUploadMb: 7 });
  });
});
