import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { newId, nowIso } from '../../lib/ids.js';
import { nameKey, slugify, validatePassword, validateSlug, validateUsername } from '../../lib/names.js';
import { toUser, USER_SELECT, type Company, type Role, type User, type UserRow } from '../../lib/models.js';
import { hashPassword } from '../../auth/password.js';

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  disabled: number;
  created_at: string;
  user_count: number;
  document_count: number;
}

const COMPANY_SELECT = `SELECT c.id, c.name, c.slug, c.disabled, c.created_at,
  (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
  (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id) AS document_count
  FROM companies c`;

const toCompany = (r: CompanyRow): Company => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  disabled: !!r.disabled,
  userCount: r.user_count,
  documentCount: r.document_count,
  createdAt: r.created_at,
});

export function validateDisplayName(v: unknown, fallback: string): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') throw errors.validation('displayName must be a string', { field: 'displayName' });
  const s = v.trim();
  // eslint-disable-next-line no-control-regex
  if (s.length < 1 || s.length > 80 || /[\u0000-\u001f\u007f]/.test(s)) throw errors.validation('displayName must be 1-80 characters', { field: 'displayName' });
  return s;
}

export class CompanyService {
  constructor(private ctx: AppContext) {}

  list(): Company[] {
    return this.ctx.db.all<CompanyRow>(`${COMPANY_SELECT} ORDER BY c.name COLLATE NOCASE`).map(toCompany);
  }

  find(id: string): Company | null {
    const r = this.ctx.db.get<CompanyRow>(`${COMPANY_SELECT} WHERE c.id = ?`, id);
    return r ? toCompany(r) : null;
  }

  require(id: string): Company {
    const c = this.find(id);
    if (!c) throw errors.notFound('Company not found');
    return c;
  }

  async insertUser(input: {
    companyId: string | null;
    username: string;
    displayName: string;
    password: string;
    role: Role;
    mustChangePassword: boolean;
  }): Promise<string> {
    const hash = await hashPassword(input.password, this.ctx.config.scryptN);
    const id = newId();
    this.ctx.db.run(
      `INSERT INTO users (id, company_id, username, username_key, display_name, role, password_hash, must_change_password, disabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      id,
      input.companyId,
      input.username,
      nameKey(input.username),
      input.displayName,
      input.role,
      hash,
      input.mustChangePassword ? 1 : 0,
      nowIso(),
    );
    return id;
  }

  async create(input: { name: string; slug?: string; adminUsername: string; adminPassword: string; adminDisplayName?: string }): Promise<Company> {
    const { db, mirror } = this.ctx;
    const name = input.name.trim();
    const username = validateUsername(input.adminUsername);
    validatePassword(input.adminPassword, 'adminPassword');
    const displayName = validateDisplayName(input.adminDisplayName, username);
    let slug: string;
    if (input.slug !== undefined && input.slug !== '') {
      slug = validateSlug(input.slug);
      if (db.get('SELECT 1 AS x FROM companies WHERE slug = ?', slug)) throw errors.conflict('Company slug already exists', { field: 'slug' });
    } else {
      const base = slugify(name);
      slug = base;
      for (let i = 2; db.get('SELECT 1 AS x FROM companies WHERE slug = ?', slug); i++) slug = `${base.slice(0, 36)}-${i}`;
    }
    const id = newId();
    // Hash first (async) so the DB transaction itself stays synchronous.
    const hash = await hashPassword(input.adminPassword, this.ctx.config.scryptN);
    db.tx(() => {
      if (db.get('SELECT 1 AS x FROM companies WHERE slug = ?', slug)) throw errors.conflict('Company slug already exists', { field: 'slug' });
      db.run('INSERT INTO companies (id, name, slug, disabled, created_at) VALUES (?, ?, ?, 0, ?)', id, name, slug, nowIso());
      db.run(
        `INSERT INTO users (id, company_id, username, username_key, display_name, role, password_hash, must_change_password, disabled, created_at)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, 0, ?)`,
        newId(),
        id,
        username,
        nameKey(username),
        displayName,
        hash,
        nowIso(),
      );
    });
    mirror.ensureCompany(id);
    return this.require(id);
  }

  update(id: string, input: { name?: string; disabled?: boolean }): Company {
    const { db, sessions, disconnect } = this.ctx;
    this.require(id);
    if (input.name !== undefined) db.run('UPDATE companies SET name = ? WHERE id = ?', input.name.trim(), id);
    if (input.disabled !== undefined) {
      db.run('UPDATE companies SET disabled = ? WHERE id = ?', input.disabled ? 1 : 0, id);
      if (input.disabled) {
        sessions.revokeCompany(id);
        disconnect.company(id, 4403);
      }
    }
    return this.require(id);
  }

  delete(id: string, confirm: string | undefined): void {
    const { db, mirror, disconnect, rooms } = this.ctx;
    const c = this.require(id);
    if (confirm !== c.slug) throw errors.validation('confirm must equal the company slug', { field: 'confirm' });
    const docIds = db.all<{ id: string }>('SELECT id FROM documents WHERE company_id = ?', id).map((r) => r.id);
    disconnect.company(id, 4404);
    for (const d of docIds) rooms.closeDocument(d, 4404);
    db.run('DELETE FROM companies WHERE id = ?', id);
    mirror.removeCompany(id);
  }

  userById(companyId: string, userId: string): UserRow | undefined {
    return this.ctx.db.get<UserRow>(`${USER_SELECT} WHERE u.id = ? AND u.company_id = ?`, userId, companyId);
  }

  listUsers(companyId: string): User[] {
    return this.ctx.db.all<UserRow>(`${USER_SELECT} WHERE u.company_id = ? ORDER BY u.username_key`, companyId).map(toUser);
  }
}
