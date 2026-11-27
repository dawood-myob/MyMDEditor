import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { nameKey, validatePassword, validateUsername } from '../../lib/names.js';
import { toUser, type Role, type User, type UserRow } from '../../lib/models.js';
import { hashPassword } from '../../auth/password.js';
import { newId, nowIso } from '../../lib/ids.js';
import { CompanyService, validateDisplayName } from '../companies/service.js';

export class UserService {
  constructor(
    private ctx: AppContext,
    private companies: CompanyService,
  ) {}

  list(companyId: string): User[] {
    return this.companies.listUsers(companyId);
  }

  private require(companyId: string, userId: string): UserRow {
    const u = this.companies.userById(companyId, userId);
    if (!u) throw errors.notFound('User not found');
    return u;
  }

  private otherActiveAdmins(companyId: string, exceptUserId: string): number {
    return this.ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE company_id = ? AND role = 'admin' AND disabled = 0 AND id <> ?", companyId, exceptUserId)!.n;
  }

  async create(companyId: string, input: { username: string; displayName?: string; password: string; role: Exclude<Role, 'superadmin'> }): Promise<User> {
    const { db, config } = this.ctx;
    const username = validateUsername(input.username);
    validatePassword(input.password);
    const displayName = validateDisplayName(input.displayName, username);
    const hash = await hashPassword(input.password, config.scryptN);
    const id = newId();
    db.tx(() => {
      const n = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE company_id = ?', companyId)!.n;
      if (n >= config.quotas.maxUsers) throw errors.tooLarge('User quota exceeded', { quota: 'users' });
      if (db.get('SELECT 1 AS x FROM users WHERE company_id = ? AND username_key = ?', companyId, nameKey(username))) {
        throw errors.conflict('Username already exists in this company', { field: 'username' });
      }
      db.run(
        `INSERT INTO users (id, company_id, username, username_key, display_name, role, password_hash, must_change_password, disabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
        id,
        companyId,
        username,
        nameKey(username),
        displayName,
        input.role,
        hash,
        nowIso(),
      );
    });
    return toUser(this.require(companyId, id));
  }

  async update(
    companyId: string,
    userId: string,
    actorId: string,
    input: { displayName?: string; role?: Exclude<Role, 'superadmin'>; disabled?: boolean; password?: string },
  ): Promise<User> {
    const { db, sessions, disconnect, config } = this.ctx;
    const target = this.require(companyId, userId);
    if (input.disabled === true && userId === actorId) throw errors.conflict('You cannot disable yourself');
    const activeAdmin = target.role === 'admin' && !target.disabled;
    const losesAdmin = (input.role !== undefined && input.role !== 'admin') || input.disabled === true;
    if (activeAdmin && losesAdmin && this.otherActiveAdmins(companyId, userId) === 0) {
      throw errors.conflict('The last active admin of a company cannot be demoted or disabled');
    }
    const displayName = input.displayName !== undefined ? validateDisplayName(input.displayName, target.display_name) : target.display_name;
    let hash: string | null = null;
    if (input.password !== undefined) {
      validatePassword(input.password);
      hash = await hashPassword(input.password, config.scryptN);
    }
    db.tx(() => {
      db.run('UPDATE users SET display_name = ?, role = ?, disabled = ? WHERE id = ?', displayName, input.role ?? target.role, input.disabled === undefined ? target.disabled : input.disabled ? 1 : 0, userId);
      if (hash) db.run('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?', hash, userId);
    });
    if (hash || input.disabled === true) {
      sessions.revokeUser(userId);
      disconnect.user(userId);
    } else if (input.role !== undefined && input.role !== target.role) {
      disconnect.refreshUser(userId);
    }
    return toUser(this.require(companyId, userId));
  }

  delete(companyId: string, userId: string, actorId: string): void {
    const { db, disconnect } = this.ctx;
    const target = this.require(companyId, userId);
    if (userId === actorId) throw errors.conflict('You cannot delete yourself');
    if (target.role === 'admin' && !target.disabled && this.otherActiveAdmins(companyId, userId) === 0) {
      throw errors.conflict('The last active admin of a company cannot be deleted');
    }
    disconnect.user(userId);
    db.run('DELETE FROM users WHERE id = ?', userId);
  }
}
