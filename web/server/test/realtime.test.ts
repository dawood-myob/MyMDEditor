import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Client, makeEnv, makeTenant, sleep, superadmin, waitFor, type Env, type Tenant } from './helpers.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

class YClient {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('content');
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  closeCode: number | null = null;
  synced = false;
  private ws!: WebSocket;

  constructor(
    private base: string,
    private docId: string,
    private cookie: string,
    private origin?: string,
  ) {}

  /** Resolves once the first sync round trip completed; rejects when the server closes first. */
  connect(): Promise<this> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (this.cookie) headers.cookie = this.cookie;
      headers.origin = this.origin ?? this.base.replace('ws:', 'http:');
      this.ws = new WebSocket(`${this.base}/ws/${this.docId}`, { headers });
      this.ws.binaryType = 'arraybuffer';
      this.ws.on('error', () => undefined);
      this.ws.on('close', (code) => {
        this.closeCode = code;
        reject(Object.assign(new Error(`closed ${code}`), { code }));
      });
      this.ws.on('open', () => {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MSG_SYNC);
        syncProtocol.writeSyncStep1(e, this.doc);
        this.ws.send(encoding.toUint8Array(e));
        const state = this.awareness.getLocalState();
        if (state) this.sendAwareness([this.doc.clientID]);
      });
      this.doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === this) return;
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MSG_SYNC);
        syncProtocol.writeUpdate(e, update);
        this.send(encoding.toUint8Array(e));
      });
      this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === 'remote') return;
        this.sendAwareness([...added, ...updated, ...removed]);
      });
      this.ws.on('message', (data: ArrayBuffer) => {
        const dec = decoding.createDecoder(new Uint8Array(data));
        const type = decoding.readVarUint(dec);
        if (type === MSG_SYNC) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MSG_SYNC);
          const kind = syncProtocol.readSyncMessage(dec, reply, this.doc, this);
          if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply));
          if (kind === syncProtocol.messageYjsSyncStep2 && !this.synced) {
            this.synced = true;
            resolve(this);
          }
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), 'remote');
        }
      });
    });
  }

  private send(buf: Uint8Array): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(buf);
  }

  private sendAwareness(ids: number[]): void {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, ids));
    this.send(encoding.toUint8Array(e));
  }

  closed(): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve) => this.ws.once('close', (c) => resolve(c)));
  }

  close(): void {
    this.ws.close();
  }
}

let env: Env;
let T: Tenant;
let U: Tenant;
let base: string;

beforeAll(async () => {
  env = await makeEnv({ PERSIST_DEBOUNCE_MS: '100', PERSIST_MAX_WAIT_MS: '500' });
  await env.app.listen({ port: 0, host: '127.0.0.1' });
  base = `ws://127.0.0.1:${(env.app.server.address() as AddressInfo).port}`;
  const sa = await superadmin(env);
  T = await makeTenant(env, sa, 'rt');
  U = await makeTenant(env, sa, 'other');
});
afterAll(() => env.close());

const newDoc = async (content = 'initial text', client: Client = T.editor) => (await client.post('/api/documents', { folderId: null, name: `rt-${Math.random().toString(36).slice(2, 8)}`, content })).json.document as { id: string; name: string };
const connect = (docId: string, who: Client, origin?: string) => new YClient(base, docId, who.cookie, origin).connect();
const dbContent = (id: string): string => env.ctx.db.get<{ content: string }>('SELECT content FROM documents WHERE id = ?', id)!.content;

describe('realtime collaboration', () => {
  it('seeds the shared text from stored content and does not duplicate it for later clients', async () => {
    const d = await newDoc('# Seeded\n\nfrom the database');
    const a = await connect(d.id, T.editor);
    expect(a.text.toString()).toBe('# Seeded\n\nfrom the database');
    const b = await connect(d.id, T.admin);
    expect(b.text.toString()).toBe('# Seeded\n\nfrom the database');
    a.close();
    b.close();
  });

  it('converges after heavy concurrent edits, then persists to SQLite, FTS, disk and versions', async () => {
    const d = await newDoc('start\nmiddle\nend');
    const a = await connect(d.id, T.editor);
    const b = await connect(d.id, T.admin);
    const c = await connect(d.id, T.viewer);

    for (let i = 0; i < 30; i++) {
      a.doc.transact(() => a.text.insert(0, `A${i} `));
      b.doc.transact(() => b.text.insert(b.text.length, ` B${i}`));
      if (i % 7 === 0) a.doc.transact(() => a.text.insert(Math.floor(a.text.length / 2), '|mid|'));
    }
    a.doc.transact(() => {
      a.text.delete(0, 3);
    });
    b.text.insert(5, 'concurrent-marker');

    await waitFor(() => a.text.toString() === b.text.toString() && b.text.toString() === c.text.toString() && a.text.toString().includes('concurrent-marker'), 8000);
    const finalText = a.text.toString();
    expect(finalText).toContain('B29');
    expect(finalText).toContain('A28');
    expect(finalText).toContain('middle');
    expect(b.text.toString()).toBe(finalText);
    expect(c.text.toString()).toBe(finalText);

    const live = (await T.viewer.get(`/api/documents/${d.id}`)).json.document.content;
    expect(live).toBe(finalText);

    await waitFor(() => dbContent(d.id) === finalText);
    const full = (await T.editor.get(`/api/documents/${d.id}`)).json.document;
    expect(full.size).toBe(Buffer.byteLength(finalText));
    const onDisk = path.join(env.ctx.mirror.companyRoot(T.id), `${full.name}`);
    await waitFor(() => fs.existsSync(onDisk) && fs.readFileSync(onDisk, 'utf8') === finalText);
    expect((await T.editor.get('/api/search?q=marker')).json.results.some((h: { documentId: string }) => h.documentId === d.id)).toBe(true);
    expect((await T.editor.get(`/api/documents/${d.id}/versions`)).json.versions.length).toBeGreaterThanOrEqual(1);

    a.close();
    b.close();
    c.close();
    await sleep(200);
    expect(dbContent(d.id)).toBe(finalText);
    expect(env.ctx.rooms.roomCount).toBe(0);
  });

  it('keeps a viewer read-only over the websocket while still delivering updates to them', async () => {
    const d = await newDoc('protected content');
    const writer = await connect(d.id, T.editor);
    const viewer = await connect(d.id, T.viewer);
    viewer.doc.transact(() => viewer.text.insert(0, 'HACKED '));
    viewer.doc.transact(() => viewer.text.delete(0, viewer.text.length));
    await sleep(400);
    expect(writer.text.toString()).toBe('protected content');
    expect(dbContent(d.id)).toBe('protected content');
    expect((await T.editor.get(`/api/documents/${d.id}`)).json.document.content).toBe('protected content');

    writer.doc.transact(() => writer.text.insert(writer.text.length, ' + edit'));
    await waitFor(() => viewer.text.toString().includes(' + edit'));
    const late = await connect(d.id, T.viewer);
    expect(late.text.toString()).toBe('protected content + edit');
    writer.close();
    viewer.close();
    late.close();
  });

  it('propagates awareness between clients', async () => {
    const d = await newDoc('aware');
    const a = await connect(d.id, T.editor);
    const b = await connect(d.id, T.admin);
    a.awareness.setLocalState({ user: { id: 'u1', name: 'Alice', color: '#ff0000', colorLight: '#ff000033' } });
    await waitFor(() => [...b.awareness.getStates().values()].some((s) => (s as { user?: { name: string } }).user?.name === 'Alice'));
    a.close();
    await waitFor(() => ![...b.awareness.getStates().values()].some((s) => (s as { user?: { name: string } }).user?.name === 'Alice'), 5000);
    b.close();
  });

  it('applies REST content updates to connected editors and closes sockets when the doc is deleted', async () => {
    const d = await newDoc('before rest');
    const a = await connect(d.id, T.editor);
    expect((await T.admin.put(`/api/documents/${d.id}/content`, { content: 'after rest' })).status).toBe(200);
    await waitFor(() => a.text.toString() === 'after rest');

    const v = (await T.editor.post(`/api/documents/${d.id}/versions`, { label: 'x' })).json.version;
    a.doc.transact(() => a.text.insert(0, 'typed '));
    await waitFor(async () => (await T.editor.get(`/api/documents/${d.id}`)).json.document.content === 'typed after rest');
    expect((await T.editor.post(`/api/documents/${d.id}/versions/${v.id}/restore`)).status).toBe(200);
    await waitFor(() => a.text.toString() === 'after rest');

    const closed = a.closed();
    expect((await T.editor.del(`/api/documents/${d.id}`)).status).toBe(204);
    expect(await closed).toBe(4404);
  });

  it('uses close codes 4401 / 4403 / 4404 at upgrade', async () => {
    const d = await newDoc('guarded');
    const code = async (id: string, cookie: string, origin?: string): Promise<number> => {
      const y = new YClient(base, id, cookie, origin);
      return y.connect().then(
        () => {
          y.close();
          return 0;
        },
        (e: { code: number }) => e.code,
      );
    };
    expect(await code(d.id, '')).toBe(4401);
    expect(await code(d.id, 'mdhub_sid=garbage')).toBe(4401);
    expect(await code(d.id, U.editor.cookie)).toBe(4403);
    expect(await code(d.id, T.editor.cookie, 'http://evil.example')).toBe(4403);
    expect(await code('00000000-0000-4000-8000-000000000000', T.editor.cookie)).toBe(4404);
    expect(await code('not-a-uuid', T.editor.cookie)).toBe(4404);
    const sa = await superadmin(env);
    expect(await code(d.id, sa.cookie)).toBe(4403);
    const foreign = await newDoc('theirs', U.editor);
    expect(await code(foreign.id, T.admin.cookie)).toBe(4403);
    expect(await code(d.id, T.editor.cookie)).toBe(0);
  });

  it('closes sockets with 4401 when the session ends and 4403 when the company is disabled', async () => {
    const d = await newDoc('session bound');
    const tmp = new Client(env);
    await tmp.login('rt', 'editor');
    const a = await connect(d.id, tmp);
    const closed = a.closed();
    await tmp.post('/api/auth/logout');
    expect(await closed).toBe(4401);

    const dd = await newDoc('company bound', U.editor);
    const b = await connect(dd.id, U.editor);
    const bc = b.closed();
    const sa = await superadmin(env);
    await sa.patch(`/api/platform/companies/${U.id}`, { disabled: true });
    expect(await bc).toBe(4403);
    await sa.patch(`/api/platform/companies/${U.id}`, { disabled: false });
    expect((await U.editor.login('other', 'editor')).status).toBe(200);
  });

  it('does not let two companies see each other through the shared realtime layer', async () => {
    const mine = await newDoc('company rt only');
    const theirs = await newDoc('company other only', U.editor);
    const a = await connect(mine.id, T.editor);
    const b = await connect(theirs.id, U.editor);
    a.doc.transact(() => a.text.insert(0, 'X'));
    await sleep(200);
    expect(b.text.toString()).toBe('company other only');
    expect(a.text.toString()).toBe('Xcompany rt only');
    a.close();
    b.close();
  });
});

describe('graceful shutdown', () => {
  it('flushes pending edits on shutdown and serves them after a restart', async () => {
    const e = await makeEnv({ PERSIST_DEBOUNCE_MS: '60000', PERSIST_MAX_WAIT_MS: '60000' });
    let restarted: Awaited<ReturnType<typeof createApp>> | null = null;
    try {
      await e.app.listen({ port: 0, host: '127.0.0.1' });
      const url = `ws://127.0.0.1:${(e.app.server.address() as AddressInfo).port}`;
      const t = await makeTenant(e, await superadmin(e), 'persist');
      const d = (await t.editor.post('/api/documents', { folderId: null, name: 'survivor', content: 'v1' })).json.document;
      const y = await new YClient(url, d.id, t.editor.cookie).connect();
      y.doc.transact(() => y.text.insert(2, ' edited over ws'));
      await sleep(250);
      expect(e.ctx.db.get<{ content: string }>('SELECT content FROM documents WHERE id = ?', d.id)!.content).toBe('v1');
      await e.app.close();

      restarted = await createApp(e.ctx.config);
      await restarted.prepare();
      await restarted.app.ready();
      const c2 = new Client({ ...e, app: restarted.app, ctx: restarted.ctx });
      expect((await c2.login('persist', 'editor')).status).toBe(200);
      expect((await c2.get(`/api/documents/${d.id}`)).json.document.content).toBe('v1 edited over ws');
      const file = path.join(restarted.ctx.mirror.companyRoot(t.id), 'survivor.md');
      expect(fs.readFileSync(file, 'utf8')).toBe('v1 edited over ws');
    } finally {
      if (restarted) await restarted.app.close();
      fs.rmSync(e.dir, { recursive: true, force: true });
    }
  });
});
