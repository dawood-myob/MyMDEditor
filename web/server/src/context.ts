import type { Config } from './config.js';
import type { Db } from './db/connection.js';
import type { Mirror } from './storage/mirror.js';
import type { EventBus } from './modules/events/bus.js';
import type { RoomManager } from './realtime/rooms.js';
import type { SessionService } from './auth/sessions.js';
import type { LoginThrottle } from './auth/throttle.js';
import type { VersionService } from './modules/versions/service.js';

export interface Logger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface AppContext {
  config: Config;
  db: Db;
  mirror: Mirror;
  bus: EventBus;
  rooms: RoomManager;
  sessions: SessionService;
  throttle: LoginThrottle;
  versions: VersionService;
  log: Logger;
  /** Closes live connections (websocket + SSE) that are no longer authorised. */
  disconnect: {
    user(userId: string, exceptSessionId?: string, code?: number): void;
    session(sessionId: string): void;
    company(companyId: string, code?: number): void;
    refreshUser(userId: string): void;
  };
}

export function createDisconnect(rooms: RoomManager, bus: EventBus): AppContext['disconnect'] {
  return {
    user(userId, exceptSessionId, code = 4401) {
      rooms.closeWhere((c) => c.userId === userId && c.sessionId !== exceptSessionId, code, 'session ended');
      bus.closeWhere((s) => s.userId === userId && s.sessionId !== exceptSessionId);
    },
    session(sessionId) {
      rooms.closeWhere((c) => c.sessionId === sessionId, 4401, 'session ended');
      bus.closeWhere((s) => s.sessionId === sessionId);
    },
    company(companyId, code = 4403) {
      rooms.closeWhere((c) => c.companyId === companyId, code, 'company unavailable');
      bus.closeWhere((s) => s.companyId === companyId);
    },
    // Role changed: reconnect so permissions are re-evaluated (1012 = service restart, clients auto-reconnect).
    refreshUser(userId) {
      rooms.closeWhere((c) => c.userId === userId, 1012, 'permissions changed');
    },
  };
}
