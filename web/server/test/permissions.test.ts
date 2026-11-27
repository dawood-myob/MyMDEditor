import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, PASSWORD, makeEnv, makeTenant, superadmin, type Env, type Tenant, type Client as C } from './helpers.js';

let env: Env;
let sa: C;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  env = await makeEnv();
  sa = await superadmin(env);
  A = await makeTenant(env, sa, 'alpha');
  B = await makeTenant(env, sa, 'beta');
});
afterAll(() => env.close());

describe('role permission matrix', () => {
  it('viewer can read but not write', async () => {
    const folder = (await A.editor.post('/api/folders', { parentId: null, name: 'Matrix' })).json.folder;
    const doc = (await A.editor.post('/api/documents', { folderId: folder.id, name: 'Doc', content: 'hello' })).json.document;
    const v = A.viewer;
    expect((await v.get('/api/tree')).status).toBe(200);
    expect((await v.get(`/api/documents/${doc.id}`)).status).toBe(200);
    expect((await v.get(`/api/documents/${doc.id}/versions`)).status).toBe(200);
    expect((await v.get('/api/search?q=hello')).status).toBe(200);
    expect((await v.get(`/api/documents/${doc.id}/export?format=md`)).status).toBe(200);
    expect((await v.get('/api/export/workspace.zip')).status).toBe(200);
    const writes: [string, string, unknown][] = [
      ['POST', '/api/folders', { parentId: null, name: 'x' }],
      ['PATCH', `/api/folders/${folder.id}`, { name: 'y' }],
      ['DELETE', `/api/folders/${folder.id}`, undefined],
      ['POST', '/api/documents', { folderId: null, name: 'z' }],
      ['PATCH', `/api/documents/${doc.id}`, { name: 'q' }],
      ['PUT', `/api/documents/${doc.id}/content`, { content: 'changed' }],
      ['DELETE', `/api/documents/${doc.id}`, undefined],
      ['POST', `/api/documents/${doc.id}/versions`, {}],
    ];
    for (const [m, url, body] of writes) {
      const r = await v.request(m, url, body ?? undefined);
      expect(r.status, `${m} ${url}`).toBe(403);
      expect(r.json.error.code).toBe('forbidden');
    }
    expect((await v.upload('/api/import', [{ name: 'a.md', data: '# a' }])).status).toBe(403);
    expect((await v.get(`/api/documents/${doc.id}`)).json.document.content).toBe('hello');
  });

  it('editor cannot manage users or platform; admin manages only own company users', async () => {
    expect((await A.editor.get(`/api/companies/${A.id}/users`)).status).toBe(403);
    expect((await A.viewer.get(`/api/companies/${A.id}/users`)).status).toBe(403);
    expect((await A.editor.post(`/api/companies/${A.id}/users`, { username: 'evil', password: PASSWORD, role: 'admin' })).status).toBe(403);
    for (const c of [A.viewer, A.editor, A.admin]) {
      expect((await c.get('/api/platform/companies')).status).toBe(403);
      expect((await c.post('/api/platform/companies', { name: 'x', adminUsername: 'xx-admin', adminPassword: PASSWORD })).status).toBe(403);
    }
    const list = await A.admin.get(`/api/companies/${A.id}/users`);
    expect(list.status).toBe(200);
    expect(list.json.users.map((u: { username: string }) => u.username).sort()).toEqual(['alpha-admin', 'editor', 'viewer']);
    expect(list.text).not.toContain('scrypt$');
  });

  it('admin creates users with mustChangePassword and can change roles', async () => {
    const created = await A.admin.post(`/api/companies/${A.id}/users`, { username: 'newbie', displayName: 'New Bie', password: PASSWORD, role: 'viewer' });
    expect(created.status).toBe(201);
    expect(created.json.user).toMatchObject({ username: 'newbie', displayName: 'New Bie', role: 'viewer', mustChangePassword: true, companyId: A.id });
    const dup = await A.admin.post(`/api/companies/${A.id}/users`, { username: 'NEWBIE', password: PASSWORD, role: 'viewer' });
    expect(dup.status).toBe(409);
    const login = new Client(env);
    await login.login('alpha', 'newbie');
    expect((await login.get('/api/tree')).status).toBe(403);
    const up = await A.admin.patch(`/api/companies/${A.id}/users/${created.json.user.id}`, { role: 'editor' });
    expect(up.json.user.role).toBe('editor');
    expect((await A.admin.post(`/api/companies/${A.id}/users`, { username: 'bad', password: 'short', role: 'viewer' })).status).toBe(400);
    expect((await A.admin.post(`/api/companies/${A.id}/users`, { username: 'bad', password: PASSWORD, role: 'superadmin' })).status).toBe(400);
    expect((await A.admin.del(`/api/companies/${A.id}/users/${created.json.user.id}`)).status).toBe(204);
  });

  it('protects the last admin and self-delete', async () => {
    const me = (await A.admin.get('/api/auth/me')).json.user;
    expect((await A.admin.del(`/api/companies/${A.id}/users/${me.id}`)).status).toBe(409);
    expect((await A.admin.patch(`/api/companies/${A.id}/users/${me.id}`, { role: 'viewer' })).status).toBe(409);
    expect((await A.admin.patch(`/api/companies/${A.id}/users/${me.id}`, { disabled: true })).status).toBe(409);
  });

  it('superadmin has no workspace but manages tenants and their users', async () => {
    const r = await sa.get('/api/tree');
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('forbidden');
    expect(r.json.error.details).toEqual({ code: 'no_company' });
    expect((await sa.get('/api/search?q=x')).status).toBe(403);
    expect((await sa.get('/api/events')).status).toBe(403);
    const list = await sa.get('/api/platform/companies');
    expect(list.status).toBe(200);
    const alpha = list.json.companies.find((c: { slug: string }) => c.slug === 'alpha');
    expect(alpha).toMatchObject({ name: 'Company alpha', disabled: false, userCount: 3 });
    expect(typeof alpha.documentCount).toBe('number');
    expect((await sa.get(`/api/companies/${A.id}/users`)).status).toBe(200);
  });

  it('platform company lifecycle: validation, disable, delete with confirm', async () => {
    expect((await sa.post('/api/platform/companies', { name: 'Dup', slug: 'alpha', adminUsername: 'dup-admin', adminPassword: PASSWORD })).status).toBe(409);
    expect((await sa.post('/api/platform/companies', { name: 'Bad Slug', slug: 'Bad Slug!', adminUsername: 'bad-admin', adminPassword: PASSWORD })).status).toBe(400);
    expect((await sa.post('/api/platform/companies', { name: 'Weak', adminUsername: 'weak-admin', adminPassword: 'short' })).status).toBe(400);
    const c = await sa.post('/api/platform/companies', { name: 'Temp Co', adminUsername: 'temp-admin', adminPassword: PASSWORD });
    expect(c.status).toBe(201);
    expect(c.json.company.slug).toBe('temp-co');
    const id = c.json.company.id;
    env.ctx.db.run('UPDATE users SET must_change_password = 0 WHERE company_id = ?', id);
    const tmp = new Client(env);
    expect((await tmp.login('temp-co', 'temp-admin')).status).toBe(200);
    const doc = await tmp.post('/api/documents', { folderId: null, name: 'gone' });
    expect(doc.status).toBe(201);

    expect((await sa.patch(`/api/platform/companies/${id}`, { disabled: true })).json.company.disabled).toBe(true);
    expect((await tmp.get('/api/tree')).status).toBe(401);
    expect((await new Client(env).login('temp-co', 'temp-admin')).status).toBe(401);
    expect((await sa.patch(`/api/platform/companies/${id}`, { disabled: false, name: 'Temp Renamed' })).json.company).toMatchObject({ disabled: false, name: 'Temp Renamed' });

    expect((await sa.del(`/api/platform/companies/${id}`)).status).toBe(400);
    expect((await sa.del(`/api/platform/companies/${id}?confirm=wrong`)).status).toBe(400);
    expect((await sa.del(`/api/platform/companies/${id}?confirm=temp-co`)).status).toBe(204);
    expect(env.ctx.db.get('SELECT 1 AS x FROM documents WHERE company_id = ?', id)).toBeUndefined();
    expect(env.ctx.db.get('SELECT 1 AS x FROM users WHERE company_id = ?', id)).toBeUndefined();
    expect((await sa.del(`/api/platform/companies/${id}?confirm=temp-co`)).status).toBe(404);
  });
});

describe('strict tenant isolation', () => {
  let aFolder: { id: string };
  let aDoc: { id: string };
  let aVersion: { id: string };
  let bDoc: { id: string };

  beforeAll(async () => {
    aFolder = (await A.editor.post('/api/folders', { parentId: null, name: 'Secret Plans' })).json.folder;
    aDoc = (await A.editor.post('/api/documents', { folderId: aFolder.id, name: 'Roadmap', content: 'zebracorn launch plan' })).json.document;
    aVersion = (await A.editor.post(`/api/documents/${aDoc.id}/versions`, { label: 'v1' })).json.version;
    bDoc = (await B.editor.post('/api/documents', { folderId: null, name: 'Beta Doc', content: 'beta only content' })).json.document;
  });

  it('never lists another company in tree or search', async () => {
    const tree = (await B.admin.get('/api/tree')).json;
    expect(JSON.stringify(tree)).not.toContain('Secret Plans');
    expect(JSON.stringify(tree)).not.toContain('Roadmap');
    const hit = await B.admin.get('/api/search?q=zebracorn');
    expect(hit.status).toBe(200);
    expect(hit.json.results).toEqual([]);
    expect((await A.viewer.get('/api/search?q=zebracorn')).json.results).toHaveLength(1);
    expect((await A.viewer.get('/api/search?q=beta')).json.results).toEqual([]);
  });

  it('treats foreign ids as 404 for every read and write', async () => {
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/documents/${aDoc.id}`],
      ['PATCH', `/api/documents/${aDoc.id}`, { name: 'stolen' }],
      ['PUT', `/api/documents/${aDoc.id}/content`, { content: 'overwritten' }],
      ['DELETE', `/api/documents/${aDoc.id}`],
      ['GET', `/api/documents/${aDoc.id}/versions`],
      ['POST', `/api/documents/${aDoc.id}/versions`, {}],
      ['GET', `/api/documents/${aDoc.id}/versions/${aVersion.id}`],
      ['POST', `/api/documents/${aDoc.id}/versions/${aVersion.id}/restore`, {}],
      ['GET', `/api/documents/${aDoc.id}/export?format=md`],
      ['GET', `/api/documents/${aDoc.id}/export?format=html`],
      ['GET', `/api/folders/${aFolder.id}/export.zip`],
      ['PATCH', `/api/folders/${aFolder.id}`, { name: 'stolen' }],
      ['DELETE', `/api/folders/${aFolder.id}`],
      ['POST', '/api/folders', { parentId: aFolder.id, name: 'inject' }],
      ['POST', '/api/documents', { folderId: aFolder.id, name: 'inject' }],
    ];
    for (const [m, url, body] of attempts) {
      const r = await B.admin.request(m, url, body);
      expect(r.status, `${m} ${url}`).toBe(404);
      expect(r.json.error.code).toBe('not_found');
    }
    expect((await B.editor.patch(`/api/documents/${bDoc.id}`, { folderId: aFolder.id })).status).toBe(404);
    expect((await B.editor.patch(`/api/folders/${(await B.editor.post('/api/folders', { parentId: null, name: 'mine' })).json.folder.id}`, { parentId: aFolder.id })).status).toBe(404);
    const after = (await A.editor.get(`/api/documents/${aDoc.id}`)).json.document;
    expect(after.name).toBe('Roadmap.md');
    expect(after.content).toBe('zebracorn launch plan');
    expect((await A.editor.get('/api/tree')).json.folders.some((f: { name: string }) => f.name === 'inject')).toBe(false);
  });

  it('does not let a company import into a foreign folder', async () => {
    const r = await B.editor.upload(`/api/import?folderId=${aFolder.id}`, [{ name: 'x.md', data: '# x' }]);
    expect(r.status).toBe(404);
    const tree = (await A.editor.get('/api/tree')).json;
    expect(tree.documents.some((d: { name: string }) => d.name === 'x.md')).toBe(false);
  });

  it('does not leak events across companies', async () => {
    const seen: string[] = [];
    env.ctx.bus.subscribe({ companyId: B.id, userId: 'u', sessionId: 's', send: (m) => seen.push(m.event), close: () => undefined });
    await A.editor.post('/api/folders', { parentId: null, name: 'noisy' });
    expect(seen).toEqual([]);
    await B.editor.post('/api/folders', { parentId: null, name: 'quiet' });
    expect(seen).toContain('tree');
  });

  it('keeps users of other companies invisible', async () => {
    expect((await B.admin.get(`/api/companies/${A.id}/users`)).status).toBe(404);
    expect((await B.admin.post(`/api/companies/${A.id}/users`, { username: 'infiltrator', password: PASSWORD, role: 'admin' })).status).toBe(404);
    const aUser = env.ctx.db.get<{ id: string }>("SELECT id FROM users WHERE username = 'viewer' AND company_id = ?", A.id)!;
    expect((await B.admin.patch(`/api/companies/${A.id}/users/${aUser.id}`, { password: 'Hijacked-Pass-1' })).status).toBe(404);
    expect((await B.admin.del(`/api/companies/${A.id}/users/${aUser.id}`)).status).toBe(404);
    expect((await B.admin.patch(`/api/companies/${B.id}/users/${aUser.id}`, { role: 'admin' })).status).toBe(404);
    expect((await A.viewer.get('/api/tree')).status).toBe(200);
  });

  it('resolves malformed ids to 404/400 and never to other data', async () => {
    expect((await B.admin.get('/api/documents/not-a-uuid')).status).toBe(404);
    expect((await B.admin.get("/api/documents/' OR 1=1 --")).status).toBe(404);
    expect((await B.admin.get('/api/search?q=%22%20OR%201%3D1')).status).toBe(200);
  });
});
