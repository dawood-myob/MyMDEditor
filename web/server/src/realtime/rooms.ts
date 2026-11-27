import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { Db } from '../db/connection.js';
import type { Config } from '../config.js';
import type { Mirror } from '../storage/mirror.js';
import type { EventBus } from '../modules/events/bus.js';
import type { VersionService } from '../modules/versions/service.js';
import type { Actor } from '../lib/models.js';
import { nowIso } from '../lib/ids.js';
import { byteLength } from '../lib/names.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const WS_OPEN = 1;

export interface RoomLogger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface Conn {
  ws: WebSocket;
  userId: string;
  userName: string;
  companyId: string;
  sessionId: string;
  canWrite: boolean;
  awarenessIds: Set<number>;
  alive: boolean;
}

export interface RoomsDeps {
  db: Db;
  config: Config;
  mirror: Mirror;
  bus: EventBus;
  versions: VersionService;
  log: RoomLogger;
}

/** Replaces the text with the smallest possible edit so concurrent editors keep their cursors/history. */
export function replaceText(text: Y.Text, next: string): void {
  const prev = text.toString();
  if (prev === next) return;
  const min = Math.min(prev.length, next.length);
  let start = 0;
  while (start < min && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(prev.charCodeAt(start - 1))) start--;
  let end = 0;
  while (end < min - start && prev.charCodeAt(prev.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  if (end > 0 && isLowSurrogate(prev.charCodeAt(prev.length - end))) end--;
  const del = prev.length - start - end;
  if (del > 0) text.delete(start, del);
  const ins = next.slice(start, next.length - end);
  if (ins.length > 0) text.insert(start, ins);
}

const isHighSurrogate = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

export class Room {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('content');
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly conns = new Map<WebSocket, Conn>();
  dirty = false;
  destroyed = false;
  debounceTimer: NodeJS.Timeout | null = null;
  maxTimer: NodeJS.Timeout | null = null;
  lastEditor: Actor | null = null;
  lastAutoVersionAt = Date.now();
  baselineDone = false;
  changedInSession = false;
  persistedText = '';

  constructor(
    readonly docId: string,
    readonly companyId: string,
  ) {
    this.awareness.setLocalState(null);
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private pingTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private deps: RoomsDeps) {
    this.pingTimer = setInterval(() => this.pingAll(), 30_000);
    this.pingTimer.unref();
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get connectionCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.conns.size;
    return n;
  }

  getRoom(docId: string): Room | undefined {
    return this.rooms.get(docId);
  }

  liveContent(docId: string): string | undefined {
    const r = this.rooms.get(docId);
    return r && !r.destroyed ? r.text.toString() : undefined;
  }

  /** Opens (or returns) the room; seeds the Y.Text from SQLite the first time. Null when the document is gone. */
  open(docId: string): Room | null {
    const existing = this.rooms.get(docId);
    if (existing && !existing.destroyed) return existing;
    const { db } = this.deps;
    const row = db.get<{ company_id: string; content: string; ystate: Uint8Array | null }>('SELECT company_id, content, ystate FROM documents WHERE id = ?', docId);
    if (!row) return null;
    const room = new Room(docId, row.company_id);
    if (row.ystate && row.ystate.byteLength > 0) {
      try {
        Y.applyUpdate(room.doc, new Uint8Array(row.ystate));
      } catch (err) {
        this.deps.log.warn({ err, docId }, 'stored yjs state unreadable; reseeding from text');
      }
    }
    const needsStore = !row.ystate || row.ystate.byteLength === 0 || room.text.toString() !== row.content;
    if (room.text.toString() !== row.content) replaceText(room.text, row.content);
    room.persistedText = row.content;
    if (needsStore) {
      // Persist the seeded state right away so a later reopen reuses the same client id/history.
      db.run('UPDATE documents SET ystate = ? WHERE id = ?', Buffer.from(Y.encodeStateAsUpdate(room.doc)), docId);
    }
    room.doc.on('update', (update: Uint8Array, origin: unknown) => this.onDocUpdate(room, update, origin));
    room.awareness.on('update', (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => this.onAwareness(room, changes, origin));
    this.rooms.set(docId, room);
    return room;
  }

  private onDocUpdate(room: Room, update: Uint8Array, origin: unknown): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);
    for (const c of room.conns.values()) this.send(c, msg);
    if (origin && typeof origin === 'object' && 'ws' in (origin as object)) {
      const c = origin as Conn;
      room.lastEditor = { id: c.userId, name: c.userName };
    }
    room.dirty = true;
    this.schedulePersist(room);
  }

  private onAwareness(room: Room, changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown): void {
    if (origin && typeof origin === 'object' && 'ws' in (origin as object)) {
      const c = origin as Conn;
      changes.added.forEach((id) => c.awarenessIds.add(id));
      changes.removed.forEach((id) => c.awarenessIds.delete(id));
    }
    const changed = changes.added.concat(changes.updated, changes.removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed));
    const msg = encoding.toUint8Array(encoder);
    for (const c of room.conns.values()) this.send(c, msg);
  }

  private send(conn: Conn, data: Uint8Array): void {
    const ws = conn.ws;
    if (ws.readyState !== WS_OPEN) return;
    if (ws.bufferedAmount > 32 * 1024 * 1024) {
      ws.close(1013, 'server busy');
      return;
    }
    ws.send(data, (err) => {
      if (err) ws.terminate();
    });
  }

  private schedulePersist(room: Room): void {
    const { debounceMs, maxWaitMs } = this.deps.config.persist;
    if (room.debounceTimer) clearTimeout(room.debounceTimer);
    room.debounceTimer = setTimeout(() => this.persist(room), debounceMs);
    room.debounceTimer.unref();
    if (!room.maxTimer) {
      room.maxTimer = setTimeout(() => this.persist(room), maxWaitMs);
      room.maxTimer.unref();
    }
  }

  private clearTimers(room: Room): void {
    if (room.debounceTimer) clearTimeout(room.debounceTimer);
    if (room.maxTimer) clearTimeout(room.maxTimer);
    room.debounceTimer = null;
    room.maxTimer = null;
  }

  /** Writes the live state to SQLite (+FTS via trigger), the disk mirror and notifies SSE listeners. */
  persist(room: Room): void {
    this.clearTimers(room);
    if (room.destroyed || !room.dirty) return;
    room.dirty = false;
    const { db, mirror, bus, versions, config, log } = this.deps;
    try {
      const text = room.text.toString();
      const changed = text !== room.persistedText;
      const ystate = Buffer.from(Y.encodeStateAsUpdate(room.doc));
      const ts = nowIso();
      let missing = false;
      db.tx(() => {
        if (changed) {
          if (!room.baselineDone) {
            room.baselineDone = true;
            if (room.persistedText.length > 0 && versions.count(room.docId) === 0) {
              versions.create(room.companyId, room.docId, room.persistedText, { kind: 'auto', author: null });
            }
          }
          const r = db.run(
            'UPDATE documents SET content = ?, ystate = ?, size = ?, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = ?',
            text,
            ystate,
            byteLength(text),
            ts,
            room.lastEditor?.id ?? null,
            room.lastEditor?.name ?? null,
            room.docId,
          );
          missing = r.changes === 0;
        } else {
          missing = db.run('UPDATE documents SET ystate = ? WHERE id = ?', ystate, room.docId).changes === 0;
        }
        if (!missing && changed && Date.now() - room.lastAutoVersionAt >= config.versions.autoIntervalMs) {
          versions.create(room.companyId, room.docId, text, { kind: 'auto', author: room.lastEditor, skipIfIdentical: true });
          room.lastAutoVersionAt = Date.now();
        }
      });
      if (missing) {
        this.destroy(room, 4404, 'document deleted');
        return;
      }
      if (changed) {
        room.persistedText = text;
        room.changedInSession = true;
        mirror.writeDocument(room.docId);
        bus.emit(room.companyId, 'document', { id: room.docId, updatedAt: ts });
      }
    } catch (err) {
      room.dirty = true;
      log.error({ err, docId: room.docId }, 'failed to persist document');
    }
  }

  /** Persists and snapshots (kind auto) the final content of a session. */
  private finalize(room: Room): void {
    this.persist(room);
    if (room.destroyed || !room.changedInSession) return;
    const { versions } = this.deps;
    try {
      versions.create(room.companyId, room.docId, room.persistedText, { kind: 'auto', author: room.lastEditor, skipIfIdentical: true });
      room.lastAutoVersionAt = Date.now();
    } catch (err) {
      this.deps.log.error({ err, docId: room.docId }, 'failed to create auto version');
    }
  }

  private destroy(room: Room, closeCode?: number, reason?: string): void {
    if (room.destroyed) return;
    room.destroyed = true;
    this.clearTimers(room);
    for (const c of [...room.conns.values()]) {
      room.conns.delete(c.ws);
      if (closeCode) this.closeWs(c.ws, closeCode, reason);
    }
    room.awareness.destroy();
    room.doc.destroy();
    if (this.rooms.get(room.docId) === room) this.rooms.delete(room.docId);
  }

  private closeWs(ws: WebSocket, code: number, reason?: string): void {
    try {
      ws.close(code, reason);
    } catch {
      ws.terminate();
    }
  }

  /** Sets the document content through the live Y.Doc so connected editors see the change. */
  applyContent(docId: string, content: string, actor: Actor): boolean {
    const room = this.open(docId);
    if (!room) return false;
    room.lastEditor = actor;
    room.doc.transact(() => replaceText(room.text, content), 'rest');
    room.dirty = true;
    this.persist(room);
    if (room.conns.size === 0) this.destroy(room);
    return true;
  }

  /** Document deleted: drop the room without persisting and close every connection. */
  closeDocument(docId: string, code = 4404, reason = 'document deleted'): void {
    const room = this.rooms.get(docId);
    if (room) this.destroy(room, code, reason);
  }

  closeWhere(pred: (c: Conn) => boolean, code: number, reason: string): void {
    for (const room of [...this.rooms.values()]) {
      for (const c of [...room.conns.values()]) if (pred(c)) this.closeWs(c.ws, code, reason);
    }
  }

  /** Registers an authenticated socket in a room and starts the y-websocket handshake. */
  attach(ws: WebSocket, room: Room, user: { id: string; name: string; companyId: string; sessionId: string; canWrite: boolean }): void {
    const conn: Conn = {
      ws,
      userId: user.id,
      userName: user.name,
      companyId: user.companyId,
      sessionId: user.sessionId,
      canWrite: user.canWrite,
      awarenessIds: new Set(),
      alive: true,
    };
    room.conns.set(ws, conn);

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (!isBinary) return;
      try {
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        this.handleMessage(room, conn, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      } catch (err) {
        this.deps.log.debug({ err, docId: room.docId }, 'invalid realtime message');
        this.closeWs(ws, 1007, 'invalid message');
      }
    });
    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('close', () => this.detach(room, conn));
    ws.on('error', () => ws.terminate());

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, room.doc);
    this.send(conn, encoding.toUint8Array(enc));
    const states = room.awareness.getStates();
    if (states.size > 0) {
      const e2 = encoding.createEncoder();
      encoding.writeVarUint(e2, MSG_AWARENESS);
      encoding.writeVarUint8Array(e2, awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())));
      this.send(conn, encoding.toUint8Array(e2));
    }
  }

  private handleMessage(room: Room, conn: Conn, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      const syncType = decoding.readVarUint(decoder);
      if (syncType === syncProtocol.messageYjsSyncStep1) {
        syncProtocol.readSyncStep1(decoder, encoder, room.doc);
      } else if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
        if (conn.canWrite && !room.destroyed) syncProtocol.readSyncStep2(decoder, room.doc, conn);
      }
      if (encoding.length(encoder) > 1) this.send(conn, encoding.toUint8Array(encoder));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
    }
  }

  private detach(room: Room, conn: Conn): void {
    if (!room.conns.delete(conn.ws)) return;
    if (!room.destroyed) {
      awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(conn.awarenessIds), null);
      if (room.conns.size === 0) {
        this.finalize(room);
        if (room.conns.size === 0) this.destroy(room);
      }
    }
  }

  private pingAll(): void {
    for (const room of this.rooms.values()) {
      for (const c of room.conns.values()) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        try {
          c.ws.ping();
        } catch {
          c.ws.terminate();
        }
      }
    }
  }

  /** Flush every room (graceful shutdown). */
  flushAll(): void {
    for (const room of [...this.rooms.values()]) this.finalize(room);
  }

  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.flushAll();
    for (const room of [...this.rooms.values()]) this.destroy(room, 1001, 'server shutting down');
  }
}
