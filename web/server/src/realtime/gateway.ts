import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { Config } from '../config.js';
import type { Db } from '../db/connection.js';
import type { SessionService } from '../auth/sessions.js';
import { canWriteDocuments } from '../auth/permissions.js';
import { UUID_RE } from '../lib/ids.js';
import type { RoomManager, RoomLogger } from './rooms.js';

export const COOKIE_NAME = 'mdhub_sid';

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      try {
        return decodeURIComponent(v.replace(/^"|"$/g, ''));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function originAllowed(req: IncomingMessage, config: Config): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (config.allowedOrigins.includes(origin)) return true;
  const hosts = [req.headers.host];
  if (config.trustProxy) {
    const fwd = req.headers['x-forwarded-host'];
    if (typeof fwd === 'string') hosts.push(...fwd.split(',').map((h) => h.trim()));
  }
  return hosts.some((h) => h && h.toLowerCase() === originHost.toLowerCase());
}

export interface Gateway {
  close(): void;
}

/** Hooks the raw HTTP server's `upgrade` event and serves `/ws/<docId>` using the y-websocket protocol. */
export function attachGateway(server: Server, deps: { config: Config; db: Db; sessions: SessionService; rooms: RoomManager; log: RoomLogger }): Gateway {
  const { config, db, sessions, rooms, log } = deps;
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.quotas.maxDocBytes * 2 + 1024 * 1024, perMessageDeflate: false });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    const m = /^\/ws\/([^/]+)\/?$/.exec(pathname);
    if (!m) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    const docId = decodeURIComponent(m[1]!);
    socket.on('error', () => socket.destroy());
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => ws.terminate());
      try {
        if (!originAllowed(req, config)) return void ws.close(4403, 'forbidden origin');
        const res = sessions.resolve(readCookie(req.headers.cookie, COOKIE_NAME));
        if (res.status === 'invalid') return void ws.close(4401, 'not authenticated');
        if (res.status === 'disabled') return void ws.close(4403, 'forbidden');
        const { user } = res.auth;
        if (!user.companyId) return void ws.close(4403, 'forbidden');
        if (user.mustChangePassword) return void ws.close(4403, 'password change required');
        if (!UUID_RE.test(docId)) return void ws.close(4404, 'document not found');
        const doc = db.get<{ company_id: string }>('SELECT company_id FROM documents WHERE id = ?', docId);
        if (!doc) return void ws.close(4404, 'document not found');
        if (doc.company_id !== user.companyId) return void ws.close(4403, 'forbidden');
        if (rooms.connectionCount >= config.wsMaxConnections) return void ws.close(1013, 'server busy');
        const room = rooms.open(docId);
        if (!room) return void ws.close(4404, 'document not found');
        if (room.conns.size >= 200) return void ws.close(1013, 'server busy');
        rooms.attach(ws, room, {
          id: user.id,
          name: user.displayName,
          companyId: user.companyId,
          sessionId: res.auth.sessionId,
          canWrite: canWriteDocuments(user.role),
        });
      } catch (err) {
        log.error({ err }, 'websocket upgrade failed');
        ws.close(1011, 'internal error');
      }
    });
  };

  server.on('upgrade', onUpgrade);
  return {
    close() {
      server.off('upgrade', onUpgrade);
      for (const c of wss.clients) c.terminate();
      wss.close();
    },
  };
}
