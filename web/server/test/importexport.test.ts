import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChromium } from '../src/modules/importexport/pdf.js';
import { makeEnv, makeTenant, superadmin, type Env, type Tenant } from './helpers.js';

let env: Env;
let T: Tenant;
let ed: Tenant['editor'];

beforeAll(async () => {
  env = await makeEnv({ MAX_UPLOAD_MB: '1', MAX_IMPORT_ZIP_ENTRIES: '20', CHROMIUM_PATH: '' });
  T = await makeTenant(env, await superadmin(env), 'ie');
  ed = T.editor;
});
afterAll(() => env.close());

const z = (files: Record<string, string>): Buffer => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)]))));
const tree = async () => (await ed.get('/api/tree')).json as { folders: { id: string; name: string; parentId: string | null }[]; documents: { id: string; name: string; folderId: string | null }[] };

describe('import', () => {
  it('imports markdown files into the root and a folder, reporting skipped files', async () => {
    const f = (await ed.post('/api/folders', { parentId: null, name: 'Inbox' })).json.folder;
    const r = await ed.upload(`/api/import?folderId=${f.id}`, [
      { name: 'one.md', data: '# One\n\nimported text uniqueimportword' },
      { name: 'two.md', data: '\uFEFFtwo with BOM' },
      { name: 'image.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    expect(r.status).toBe(200);
    expect(r.json.imported).toEqual({ folders: 0, documents: 2 });
    expect(r.json.skipped).toEqual(['image.png']);
    const t = await tree();
    const docs = t.documents.filter((d) => d.folderId === f.id).map((d) => d.name).sort();
    expect(docs).toEqual(['one.md', 'two.md']);
    const two = t.documents.find((d) => d.name === 'two.md')!;
    expect((await ed.get(`/api/documents/${two.id}`)).json.document.content).toBe('two with BOM');
    expect((await ed.get('/api/search?q=uniqueimportword')).json.results).toHaveLength(1);

    const again = await ed.upload(`/api/import?folderId=${f.id}`, [{ name: 'one.md', data: 'second' }, { name: 'one.md', data: 'third' }]);
    expect(again.json.imported.documents).toBe(2);
    const names = (await tree()).documents.filter((d) => d.folderId === f.id).map((d) => d.name).sort();
    expect(names).toEqual(['one (2).md', 'one (3).md', 'one.md', 'two.md']);
  });

  it('imports a zip preserving hierarchy and skipping non-markdown entries', async () => {
    const r = await ed.upload('/api/import', [
      {
        name: 'bundle.zip',
        data: z({
          'Handbook/Intro.md': '# Intro',
          'Handbook/HR/Leave.md': 'leave policy zipword',
          'Handbook/HR/logo.png': 'not really',
          'Handbook/.hidden.md': 'hidden',
          '__MACOSX/Handbook/._Intro.md': 'junk',
          'root.md': 'root doc',
        }),
      },
    ]);
    expect(r.status, r.text).toBe(200);
    expect(r.json.imported.documents).toBe(3);
    expect(r.json.imported.folders).toBe(2);
    expect(r.json.skipped).toContain('Handbook/HR/logo.png');
    const t = await tree();
    const hb = t.folders.find((x) => x.name === 'Handbook')!;
    const hr = t.folders.find((x) => x.name === 'HR')!;
    expect(hb.parentId).toBeNull();
    expect(hr.parentId).toBe(hb.id);
    expect(t.documents.find((d) => d.name === 'Leave.md')!.folderId).toBe(hr.id);
    expect(t.documents.find((d) => d.name === 'root.md')!.folderId).toBeNull();
    expect((await ed.get('/api/search?q=zipword')).json.results[0].path).toBe('Handbook/HR/Leave.md');

    const merge = await ed.upload('/api/import', [{ name: 'again.zip', data: z({ 'Handbook/Intro.md': 'again' }) }]);
    expect(merge.json.imported).toEqual({ folders: 0, documents: 1 });
    const t2 = await tree();
    expect(t2.folders.filter((x) => x.name === 'Handbook')).toHaveLength(1);
    expect(t2.documents.some((d) => d.name === 'Intro (2).md' && d.folderId === hb.id)).toBe(true);
  });

  it('rejects zip-slip, absolute and drive paths without writing anything', async () => {
    const before = (await tree()).documents.length;
    const outside = path.join(env.dir, 'outside');
    for (const evil of ['../evil.md', 'a/../../evil.md', '/abs/evil.md', 'C:/evil.md', '..\\evil.md', 'ok/../../../evil.md']) {
      const r = await ed.upload('/api/import', [{ name: 'evil.zip', data: z({ 'fine.md': 'fine', [evil]: 'pwn' }) }]);
      expect(r.status, evil).toBe(400);
      expect(r.json.error.code).toBe('validation');
    }
    expect((await tree()).documents.length).toBe(before);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.existsSync(path.join(env.dir, 'evil.md'))).toBe(false);
    expect(fs.existsSync(path.join(env.dir, 'data', 'evil.md'))).toBe(false);
  });

  it('enforces entry-count, size and validity limits', async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 25; i++) many[`f${i}.md`] = 'x';
    const r = await ed.upload('/api/import', [{ name: 'many.zip', data: z(many) }]);
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('payload_too_large');

    const huge = await ed.upload('/api/import', [{ name: 'huge.md', data: 'a'.repeat(2 * 1024 * 1024) }]);
    expect(huge.status).toBe(413);

    const notZip = await ed.upload('/api/import', [{ name: 'fake.zip', data: 'this is not a zip' }]);
    expect(notZip.status).toBe(400);

    expect((await ed.post('/api/import', {})).status).toBe(400);
    expect((await ed.request('POST', '/api/import', undefined, { raw: '', headers: { 'content-type': 'multipart/form-data; boundary=x' } })).status).toBeGreaterThanOrEqual(400);
  });

  it('sanitises hostile names inside archives', async () => {
    const r = await ed.upload('/api/import', [{ name: 'weird.zip', data: z({ 'we:ird*/na?me<>.md': 'x', 'CON/nul.md': 'y' }) }]);
    expect(r.status, r.text).toBe(200);
    const t = await tree();
    for (const n of [...t.folders.map((f) => f.name), ...t.documents.map((d) => d.name)]) expect(n).not.toMatch(/[:*?<>"|\\/]/);
  });
});

describe('export', () => {
  let docId: string;
  const content = '# Export Me\n\nSome **bold** text and `code`.\n\n<script>alert("xss")</script>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n```js\nconst x = 1;\n```\n';

  beforeAll(async () => {
    const f = (await ed.post('/api/folders', { parentId: null, name: 'Exports' })).json.folder;
    docId = (await ed.post('/api/documents', { folderId: f.id, name: 'Report ünï', content })).json.document.id;
  });

  it('exports markdown verbatim as an attachment', async () => {
    const r = await ed.get(`/api/documents/${docId}/export?format=md`);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/markdown');
    expect(String(r.headers['content-disposition'])).toMatch(/^attachment; filename="[^"]*\.md"; filename\*=UTF-8''Report%20%C3%BCn%C3%AF\.md$/);
    expect(r.text).toBe(content);
    expect((await ed.get(`/api/documents/${docId}/export`)).text).toBe(content);
  });

  it('exports self-contained, escaped HTML', async () => {
    const r = await ed.get(`/api/documents/${docId}/export?format=html`);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/html');
    expect(String(r.headers['content-disposition'])).toContain('.html');
    expect(r.text).toContain('<h1');
    expect(r.text).toContain('<table');
    expect(r.text).toContain('<style');
    expect(r.text).toContain('hljs');
    expect(r.text).not.toContain('<script>alert');
    expect(r.text).toContain('&lt;script&gt;');
  });

  it('exports a DOCX (zip with word/document.xml)', async () => {
    const r = await ed.get(`/api/documents/${docId}/export?format=docx`);
    expect(r.status, r.text.slice(0, 200)).toBe(200);
    expect(String(r.headers['content-type'])).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(r.body.subarray(0, 2).toString()).toBe('PK');
    const files = unzipSync(new Uint8Array(r.body));
    expect(Object.keys(files)).toContain('word/document.xml');
    expect(strFromU8(files['word/document.xml']!)).toContain('Export Me');
  });

  it('answers 501 export_unavailable when no Chromium is available, and validates the format', async () => {
    const e2 = await makeEnv({ CHROMIUM_PATH: path.join(env.dir, 'definitely-missing-browser.exe') });
    try {
      const t2 = await makeTenant(e2, await superadmin(e2), 'nopdf');
      const d = (await t2.editor.post('/api/documents', { folderId: null, name: 'p', content: '# p' })).json.document;
      const r = await t2.editor.get(`/api/documents/${d.id}/export?format=pdf`);
      expect(r.status).toBe(501);
      expect(r.json.error.code).toBe('export_unavailable');
    } finally {
      await e2.close();
    }
    expect((await ed.get(`/api/documents/${docId}/export?format=exe`)).status).toBe(400);
  });

  it.skipIf(!findChromium(null))('exports a PDF with a local Chromium', async () => {
    const e2 = await makeEnv({ CHROMIUM_PATH: findChromium(null)! });
    try {
      const t2 = await makeTenant(e2, await superadmin(e2), 'pdf');
      const d = (await t2.editor.post('/api/documents', { folderId: null, name: 'pdf doc', content })).json.document;
      const r = await t2.editor.get(`/api/documents/${d.id}/export?format=pdf`);
      expect(r.status, r.text.slice(0, 200)).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
      expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await e2.close();
    }
  }, 60_000);

  it('exports the workspace and folder zips preserving the hierarchy', async () => {
    const ws = await ed.get('/api/export/workspace.zip');
    expect(ws.status).toBe(200);
    expect(ws.headers['content-type']).toBe('application/zip');
    expect(String(ws.headers['content-disposition'])).toContain('.zip');
    const files = unzipSync(new Uint8Array(ws.body));
    expect(Object.keys(files)).toContain('Exports/Report ünï.md');
    expect(strFromU8(files['Exports/Report ünï.md']!)).toBe(content);
    expect(Object.keys(files).every((n) => !n.includes('..') && !n.startsWith('/'))).toBe(true);

    const exportsFolder = (await tree()).folders.find((f) => f.name === 'Exports')!;
    const fz = await ed.get(`/api/folders/${exportsFolder.id}/export.zip`);
    expect(fz.status).toBe(200);
    const fFiles = unzipSync(new Uint8Array(fz.body));
    expect(Object.keys(fFiles).filter((n) => n.endsWith('.md'))).toEqual(['Exports/Report ünï.md']);

    expect((await ed.get('/api/folders/00000000-0000-4000-8000-000000000000/export.zip')).status).toBe(404);
    expect((await ed.get('/api/documents/00000000-0000-4000-8000-000000000000/export?format=md')).status).toBe(404);
  });

  it('round-trips a workspace export back through import', async () => {
    const ws = await ed.get('/api/export/workspace.zip');
    const before = (await tree()).documents.length;
    const r = await ed.upload('/api/import', [{ name: 'workspace.zip', data: ws.body }]);
    expect(r.status, r.text).toBe(200);
    expect(r.json.imported.documents).toBe(before);
  });

  it('exports live (unsaved) collaborative content', async () => {
    await ed.put(`/api/documents/${docId}/content`, { content: '# Live Content' });
    expect((await ed.get(`/api/documents/${docId}/export?format=md`)).text).toBe('# Live Content');
  });
});
