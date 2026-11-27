import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, makeEnv, makeTenant, superadmin, waitFor, type Env, type Tenant } from './helpers.js';

let env: Env;
let T: Tenant;
let ed: Tenant['editor'];

const root = (): string => env.ctx.mirror.companyRoot(T.id);
const exists = (...p: string[]): boolean => fs.existsSync(path.join(root(), ...p));
const read = (...p: string[]): string => fs.readFileSync(path.join(root(), ...p), 'utf8');

beforeAll(async () => {
  env = await makeEnv({ MAX_DOC_MB: '1', MAX_FOLDER_DEPTH: '4', MAX_DOCS_PER_COMPANY: '40' });
  const sa = await superadmin(env);
  T = await makeTenant(env, sa, 'work');
  ed = T.editor;
});
afterAll(() => env.close());

const folder = async (name: string, parentId: string | null = null) => {
  const r = await ed.post('/api/folders', { parentId, name });
  expect(r.status, `folder ${name}: ${r.text}`).toBe(201);
  return r.json.folder as { id: string; parentId: string | null; name: string; createdAt: string };
};
const doc = async (name: string, folderId: string | null = null, content?: string) => {
  const r = await ed.post('/api/documents', { folderId, name, content });
  expect(r.status, `doc ${name}: ${r.text}`).toBe(201);
  return r.json.document as { id: string; name: string; path: string; content: string; size: number; folderId: string | null; updatedByName: string | null };
};

describe('names and validation', () => {
  it.each(['a/b', 'a\\b', '..', '.', 'a..b/c', 'bad\u0000name', 'tab\tname', 'what?', 'a:b', 'x*y', 'q"q', 'a<b', 'a|b', 'trail.', 'CON', 'nul', 'com1', '', '   ', 'x'.repeat(121)])(
    'rejects folder name %j',
    async (name) => {
      const r = await ed.post('/api/folders', { parentId: null, name });
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('validation');
    },
  );

  it('rejects bad document names, appends .md and does not treat .markdown as an extension', async () => {
    for (const name of ['a/b.md', '..', 'x\\y', 'nul.md', 'z'.repeat(121) + '.md']) {
      expect((await ed.post('/api/documents', { folderId: null, name })).status, name).toBe(400);
    }
    const d = await doc('Plain Name');
    expect(d.name).toBe('Plain Name.md');
    expect(d.path).toBe('Plain Name.md');
    expect((await doc('Already.md')).name).toBe('Already.md');
    expect((await doc('legacy.markdown')).name).toBe('legacy.markdown.md');
    expect((await ed.post('/api/documents', { name: 'missing folder field' })).status).toBeLessThan(500);
  });

  it('enforces case-insensitive unique siblings across folders and documents', async () => {
    const f = await folder('Unique');
    expect((await ed.post('/api/folders', { parentId: null, name: 'unique' })).status).toBe(409);
    expect((await ed.post('/api/folders', { parentId: null, name: 'UNIQUE' })).json.error.code).toBe('conflict');
    await doc('Same.md', f.id);
    expect((await ed.post('/api/documents', { folderId: f.id, name: 'same' })).status).toBe(409);
    expect((await ed.post('/api/documents', { folderId: f.id, name: 'SAME.MD' })).status).toBe(409);
    expect((await ed.post('/api/documents', { folderId: null, name: 'same' })).status).toBe(201);
    await folder('Clash.md', f.id);
    expect((await ed.post('/api/documents', { folderId: f.id, name: 'clash' })).status).toBe(409);
  });

  it('trims surrounding whitespace from names', async () => {
    expect((await folder('  padded  ')).name).toBe('padded');
  });

  it('limits folder depth', async () => {
    let parent: string | null = null;
    for (let i = 1; i <= 4; i++) parent = (await folder(`depth${i}`, parent)).id;
    const r = await ed.post('/api/folders', { parentId: parent, name: 'depth5' });
    expect(r.status).toBe(400);
  });
});

describe('folders', () => {
  it('creates, renames, moves, prevents cycles and deletes recursively', async () => {
    const a = await folder('Tree A');
    const b = await folder('Tree B', a.id);
    const c = await folder('Tree C', b.id);
    expect(a).toMatchObject({ parentId: null, name: 'Tree A' });
    expect(typeof a.createdAt).toBe('string');

    for (const target of [a.id, b.id, c.id]) {
      const r = await ed.patch(`/api/folders/${a.id}`, { parentId: target });
      expect(r.status, `move into ${target}`).toBe(409);
    }
    expect((await ed.patch(`/api/folders/${b.id}`, { parentId: c.id })).status).toBe(409);

    const renamed = await ed.patch(`/api/folders/${b.id}`, { name: 'Tree B2' });
    expect(renamed.json.folder.name).toBe('Tree B2');
    expect((await ed.patch(`/api/folders/${b.id}`, { name: 'tree a' })).status).toBe(200);
    expect((await ed.patch(`/api/folders/${b.id}`, { name: 'Tree B2' })).status).toBe(200);

    const moved = await ed.patch(`/api/folders/${c.id}`, { parentId: null });
    expect(moved.json.folder.parentId).toBeNull();
    expect((await ed.patch(`/api/folders/${c.id}`, { parentId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await ed.patch(`/api/folders/${c.id}`, { parentId: 'nope' })).status).toBe(400);

    const d1 = await doc('inside', b.id, 'unique-needle-xyz');
    await ed.del(`/api/folders/${a.id}`);
    expect((await ed.get(`/api/documents/${d1.id}`)).status).toBe(404);
    expect((await ed.get('/api/search?q=unique-needle-xyz')).json.results).toEqual([]);
    const tree = (await ed.get('/api/tree')).json;
    expect(tree.folders.find((f: { id: string }) => f.id === a.id)).toBeUndefined();
    expect(tree.folders.find((f: { id: string }) => f.id === b.id)).toBeUndefined();
    expect(tree.folders.find((f: { id: string }) => f.id === c.id)).toBeDefined();
    expect((await ed.del(`/api/folders/${a.id}`)).status).toBe(404);
    expect(env.ctx.db.get('SELECT 1 AS x FROM versions WHERE document_id = ?', d1.id)).toBeUndefined();
    expect(env.ctx.db.get('SELECT 1 AS x FROM documents_fts WHERE documents_fts MATCH ?', 'unique')).toBeUndefined();
  });

  it('reports moved-to-collision as conflict', async () => {
    const x = await folder('Coll X');
    const y = await folder('Coll Y');
    await folder('Dup', x.id);
    const dup2 = await folder('Dup', y.id);
    expect((await ed.patch(`/api/folders/${dup2.id}`, { parentId: x.id })).status).toBe(409);
  });
});

describe('documents', () => {
  it('creates with content, reads, renames, moves, updates content and deletes', async () => {
    const f1 = await folder('Docs One');
    const f2 = await folder('Docs Two');
    const d = await doc('Note', f1.id, '# Title\n\nbody');
    expect(d).toMatchObject({ name: 'Note.md', path: 'Docs One/Note.md', content: '# Title\n\nbody', folderId: f1.id, size: 13 });
    expect(d.updatedByName).toBe('editor');

    const renamed = (await ed.patch(`/api/documents/${d.id}`, { name: 'Renamed' })).json.document;
    expect(renamed.name).toBe('Renamed.md');
    const moved = (await ed.patch(`/api/documents/${d.id}`, { folderId: f2.id })).json.document;
    expect(moved.path).toBe('Docs Two/Renamed.md');
    expect((await ed.patch(`/api/documents/${d.id}`, { folderId: null })).json.document.path).toBe('Renamed.md');
    expect((await ed.patch(`/api/documents/${d.id}`, { name: 'bad/name' })).status).toBe(400);

    const put = await ed.put(`/api/documents/${d.id}/content`, { content: 'új tartalom ✓ 🎉' });
    expect(put.status).toBe(200);
    expect(put.json.document.content).toBe('új tartalom ✓ 🎉');
    expect(put.json.document.size).toBe(Buffer.byteLength('új tartalom ✓ 🎉'));
    expect((await ed.get(`/api/documents/${d.id}`)).json.document.content).toBe('új tartalom ✓ 🎉');
    expect((await ed.put(`/api/documents/${d.id}/content`, { content: 5 })).status).toBe(400);
    expect((await ed.put(`/api/documents/${d.id}/content`, {})).status).toBe(400);

    const tree = (await ed.get('/api/tree')).json;
    const meta = tree.documents.find((x: { id: string }) => x.id === d.id);
    expect(meta).toBeDefined();
    expect(meta).not.toHaveProperty('content');
    expect(Object.keys(meta).sort()).toEqual(['createdAt', 'folderId', 'id', 'name', 'size', 'updatedAt', 'updatedByName']);

    expect((await ed.del(`/api/documents/${d.id}`)).status).toBe(204);
    expect((await ed.get(`/api/documents/${d.id}`)).status).toBe(404);
    expect((await ed.del(`/api/documents/${d.id}`)).status).toBe(404);
  });

  it('rejects oversized content and enforces the document quota', async () => {
    const d = await doc('Big');
    const big = 'x'.repeat(1024 * 1024 + 10);
    const r = await ed.put(`/api/documents/${d.id}/content`, { content: big });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('payload_too_large');
    expect((await ed.post('/api/documents', { folderId: null, name: 'Big2', content: big })).status).toBe(413);

    const q = await makeEnv({ MAX_DOCS_PER_COMPANY: '2', MAX_FOLDERS_PER_COMPANY: '1', MAX_USERS_PER_COMPANY: '3' });
    try {
      const qt = await makeTenant(q, await superadmin(q), 'quota');
      expect((await qt.editor.post('/api/folders', { parentId: null, name: 'one' })).status).toBe(201);
      const second = await qt.editor.post('/api/folders', { parentId: null, name: 'two' });
      expect(second.status).toBe(413);
      expect(second.json.error.code).toBe('payload_too_large');
      expect((await qt.editor.post('/api/documents', { folderId: null, name: 'a' })).status).toBe(201);
      expect((await qt.editor.post('/api/documents', { folderId: null, name: 'b' })).status).toBe(201);
      expect((await qt.editor.post('/api/documents', { folderId: null, name: 'c' })).status).toBe(413);
      expect((await qt.admin.post(`/api/companies/${qt.id}/users`, { username: 'fourth', password: PASSWORD, role: 'viewer' })).status).toBe(413);
    } finally {
      await q.close();
    }
  });
});

describe('versions', () => {
  it('creates manual versions, lists newest first, reads and restores', async () => {
    const d = await doc('Versioned', null, 'one');
    const v1 = await ed.post(`/api/documents/${d.id}/versions`, { label: 'first' });
    expect(v1.status).toBe(201);
    expect(v1.json.version).toMatchObject({ documentId: d.id, label: 'first', kind: 'manual', size: 3 });
    expect(v1.json.version.authorName).toBeTruthy();
    expect(v1.json.version).not.toHaveProperty('content');

    await ed.put(`/api/documents/${d.id}/content`, { content: 'two two' });
    const v2 = (await ed.post(`/api/documents/${d.id}/versions`, {})).json.version;
    expect(v2.label).toBeNull();
    await ed.put(`/api/documents/${d.id}/content`, { content: 'three' });

    const list = (await ed.get(`/api/documents/${d.id}/versions`)).json.versions as { id: string; kind: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((v) => v.id);
    expect(ids.indexOf(v2.id)).toBeLessThan(ids.indexOf(v1.json.version.id));

    const full = (await ed.get(`/api/documents/${d.id}/versions/${v1.json.version.id}`)).json.version;
    expect(full.content).toBe('one');

    const restored = await ed.post(`/api/documents/${d.id}/versions/${v1.json.version.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.json.document.content).toBe('one');
    expect((await ed.get(`/api/documents/${d.id}`)).json.document.content).toBe('one');

    const after = (await ed.get(`/api/documents/${d.id}/versions`)).json.versions as { id: string; kind: string; size: number }[];
    const snap = after.find((v) => v.kind === 'restore');
    expect(snap).toBeDefined();
    expect((await ed.get(`/api/documents/${d.id}/versions/${snap!.id}`)).json.version.content).toBe('three');

    expect((await ed.get(`/api/documents/${d.id}/versions/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    const other = await doc('Other', null, 'zzz');
    expect((await ed.get(`/api/documents/${other.id}/versions/${v1.json.version.id}`)).status).toBe(404);
    expect((await ed.post(`/api/documents/${other.id}/versions/${v1.json.version.id}/restore`)).status).toBe(404);
  });

  it('validates labels and removes versions with the document', async () => {
    const d = await doc('Labelled', null, 'x');
    expect((await ed.post(`/api/documents/${d.id}/versions`, { label: 'l'.repeat(500) })).status).toBe(400);
    await ed.post(`/api/documents/${d.id}/versions`, { label: 'ok' });
    await ed.del(`/api/documents/${d.id}`);
    expect(env.ctx.db.get('SELECT 1 AS x FROM versions WHERE document_id = ?', d.id)).toBeUndefined();
  });
});

describe('search', () => {
  it('returns FTS5 snippets with private-use markers, prefix matching and company scoping', async () => {
    const d = await doc('Search Subject', null, 'The quick brown fox jumps over the lazy dog.\n\nSecond paragraph mentions kubernetes clusters.');
    const r = await ed.get('/api/search?q=kuber');
    expect(r.status).toBe(200);
    const hit = r.json.results.find((h: { documentId: string }) => h.documentId === d.id);
    expect(hit).toBeDefined();
    expect(hit).toMatchObject({ name: 'Search Subject.md', path: 'Search Subject.md' });
    expect(hit.snippet).toContain('\uE000kubernetes\uE001');
    expect(Object.keys(hit).sort()).toEqual(['documentId', 'name', 'path', 'snippet']);

    expect((await ed.get('/api/search?q=quick%20fox')).json.results.some((h: { documentId: string }) => h.documentId === d.id)).toBe(true);
    expect((await ed.get('/api/search?q=search%20subj')).json.results.some((h: { documentId: string }) => h.documentId === d.id)).toBe(true);
    expect((await ed.get('/api/search?q=jumpz')).json.results).toEqual([]);
    expect((await ed.get('/api/search?q=')).json.results).toEqual([]);
  });

  it('survives FTS special syntax and validates limit', async () => {
    for (const q of ['"', '*', 'a AND', 'NEAR(', '(((', 'foo OR', '"unterminated', '-', 'col:val', "it's", '\\', '%00']) {
      const r = await ed.get(`/api/search?q=${encodeURIComponent(q)}`);
      expect(r.status, q).toBe(200);
    }
    await doc('Lim 1', null, 'limitword');
    await doc('Lim 2', null, 'limitword');
    await doc('Lim 3', null, 'limitword');
    expect((await ed.get('/api/search?q=limitword&limit=2')).json.results).toHaveLength(2);
    expect((await ed.get('/api/search?q=limitword&limit=0')).status).toBe(400);
    expect((await ed.get('/api/search?q=limitword&limit=1000')).status).toBe(400);
  });

  it('tracks content edits, renames and deletes', async () => {
    const d = await doc('Tracked', null, 'alphaterm');
    expect((await ed.get('/api/search?q=alphaterm')).json.results).toHaveLength(1);
    await ed.put(`/api/documents/${d.id}/content`, { content: 'betaterm now' });
    expect((await ed.get('/api/search?q=alphaterm')).json.results).toHaveLength(0);
    expect((await ed.get('/api/search?q=betaterm')).json.results).toHaveLength(1);
    await ed.patch(`/api/documents/${d.id}`, { name: 'Gammaname' });
    expect((await ed.get('/api/search?q=gammaname')).json.results).toHaveLength(1);
    await ed.del(`/api/documents/${d.id}`);
    expect((await ed.get('/api/search?q=betaterm')).json.results).toHaveLength(0);
  });
});

describe('disk mirror', () => {
  it('mirrors create, content, rename, move and delete', async () => {
    const f = await folder('Mirror Dir');
    const sub = await folder('Sub', f.id);
    const d = await doc('Mirrored', sub.id, 'first content');
    expect(exists('Mirror Dir', 'Sub', 'Mirrored.md')).toBe(true);
    expect(read('Mirror Dir', 'Sub', 'Mirrored.md')).toBe('first content');

    await ed.put(`/api/documents/${d.id}/content`, { content: 'second content' });
    await waitFor(() => read('Mirror Dir', 'Sub', 'Mirrored.md') === 'second content');

    await ed.patch(`/api/documents/${d.id}`, { name: 'Mirrored Again' });
    expect(exists('Mirror Dir', 'Sub', 'Mirrored.md')).toBe(false);
    expect(read('Mirror Dir', 'Sub', 'Mirrored Again.md')).toBe('second content');

    await ed.patch(`/api/folders/${sub.id}`, { name: 'Sub Renamed' });
    expect(read('Mirror Dir', 'Sub Renamed', 'Mirrored Again.md')).toBe('second content');
    expect(exists('Mirror Dir', 'Sub')).toBe(false);

    await ed.patch(`/api/folders/${sub.id}`, { parentId: null });
    expect(read('Sub Renamed', 'Mirrored Again.md')).toBe('second content');

    await ed.del(`/api/folders/${sub.id}`);
    expect(exists('Sub Renamed')).toBe(false);
    await ed.del(`/api/folders/${f.id}`);
    expect(exists('Mirror Dir')).toBe(false);
  });

  it('keeps every written path inside the company root', async () => {
    const entries = fs.readdirSync(root(), { recursive: true, withFileTypes: true });
    for (const e of entries) {
      const abs = path.resolve(e.parentPath, e.name);
      expect(abs.startsWith(path.resolve(root()) + path.sep)).toBe(true);
    }
    const hostile = env.ctx.mirror.resolve(T.id, ['..', '..', 'evil.md']);
    expect(hostile.startsWith(path.resolve(root()) + path.sep)).toBe(true);
    expect(path.basename(hostile)).toBe('evil.md');
  });

  it('reconcile() restores missing files, removes strays and fixes drifted content', async () => {
    const f = await folder('Recon');
    const d = await doc('Keep', f.id, 'db content');
    fs.rmSync(path.join(root(), 'Recon', 'Keep.md'));
    fs.writeFileSync(path.join(root(), 'stray.md'), 'not in db');
    fs.mkdirSync(path.join(root(), 'stray-dir'));
    fs.writeFileSync(path.join(root(), 'stray-dir', 'x.md'), 'x');
    env.ctx.mirror.reconcileAll();
    expect(read('Recon', 'Keep.md')).toBe('db content');
    expect(exists('stray.md')).toBe(false);
    expect(exists('stray-dir')).toBe(false);

    fs.writeFileSync(path.join(root(), 'Recon', 'Keep.md'), 'tampered');
    env.ctx.mirror.reconcileAll();
    expect(read('Recon', 'Keep.md')).toBe('db content');
    expect((await ed.get(`/api/documents/${d.id}`)).json.document.content).toBe('db content');
  });

  it('writes each company into its own directory', async () => {
    const dirs = fs.readdirSync(env.ctx.mirror.companiesDir);
    expect(dirs).toContain(T.id);
    expect(dirs.every((n) => /^[0-9a-f-]{36}$/.test(n))).toBe(true);
  });
});
