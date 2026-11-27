import crypto from 'node:crypto';
import type { Db } from '../db/connection.js';
import type { Config } from '../config.js';
import { USER_SELECT, toUser, type User, type UserRow } from '../lib/models.js';

export interface AuthContext {
  sessionId: string;
  user: User;
}

export type ResolveResult =
  | { status: 'ok'; auth: AuthContext; refreshed: boolean }
  | { status: 'disabled' }
  | { status: 'invalid' };

export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export class SessionService {
  constructor(
    private db: Db,
    private config: Config,
  ) {}

  get ttlSeconds(): number {
    return Math.floor(this.config.sessionTtlHours * 3600);
  }

  create(userId: string, ip: string | undefined, userAgent: string | undefined): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + this.ttlSeconds * 1000);
    this.db.run(
      'INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      hashToken(token),
      userId,
      now.toISOString(),
      now.toISOString(),
      expires.toISOString(),
      ip ?? null,
      (userAgent ?? '').slice(0, 200),
    );
    return token;
  }

  /** Looks up a session by raw token; slides the expiry (at most once per minute). */
  resolve(token: string | undefined): ResolveResult {
    if (!token || token.length < 20 || token.length > 200) return { status: 'invalid' };
    const id = hashToken(token);
    const s = this.db.get<{ id: string; user_id: string; created_at: string; last_seen_at: string; expires_at: string }>(
      'SELECT id, user_id, created_at, last_seen_at, expires_at FROM sessions WHERE id = ?',
      id,
    );
    if (!s) return { status: 'invalid' };
    const now = Date.now();
    if (Date.parse(s.expires_at) <= now) {
      this.db.run('DELETE FROM sessions WHERE id = ?', id);
      return { status: 'invalid' };
    }
    const row = this.db.get<UserRow>(`${USER_SELECT} WHERE u.id = ?`, s.user_id);
    if (!row) return { status: 'invalid' };
    if (row.disabled || row.company_disabled) return { status: 'disabled' };
    let refreshed = false;
    if (now - Date.parse(s.last_seen_at) > 60_000) {
      const maxAbs = Date.parse(s.created_at) + this.config.sessionMaxDays * 86_400_000;
      const next = Math.min(now + this.ttlSeconds * 1000, maxAbs);
      this.db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', new Date(now).toISOString(), new Date(next).toISOString(), id);
      refreshed = true;
    }
    return { status: 'ok', auth: { sessionId: id, user: toUser(row) }, refreshed };
  }

  revoke(sessionId: string): void {
    this.db.run('DELETE FROM sessions WHERE id = ?', sessionId);
  }

  revokeUser(userId: string, exceptSessionId?: string): void {
    if (exceptSessionId) this.db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, exceptSessionId);
    else this.db.run('DELETE FROM sessions WHERE user_id = ?', userId);
  }

  revokeCompany(companyId: string): void {
    this.db.run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)', companyId);
  }

  purgeExpired(): number {
    return this.db.run('DELETE FROM sessions WHERE expires_at <= ?', new Date().toISOString()).changes;
  }
}
