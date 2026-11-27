import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { errors } from '../lib/errors.js';
import { parse } from '../lib/schema.js';
import { validatePassword } from '../lib/names.js';
import { USER_SELECT, toUser, type UserRow } from '../lib/models.js';
import { hashPassword, verifyDummy, verifyPassword } from './password.js';
import { clearSessionCookie, requireAuth, setSessionCookie } from './guard.js';

const loginSchema = z.object({
  company: z.string().max(100).optional().nullable(),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(500),
  newPassword: z.string(),
});

export function authRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const { db, config, throttle, sessions } = ctx;

    app.post('/api/auth/login', async (req, reply) => {
      const body = parse(loginSchema, req.body);
      const ip = req.ip;
      const company = (body.company ?? '').trim().toLowerCase();
      const usernameKey = body.username.normalize('NFC').toLowerCase();

      const retry = throttle.hitIp(ip);
      if (retry) throw errors.rateLimited(retry);
      const locked = throttle.lockedSeconds(ip, company, usernameKey);
      if (locked) throw errors.accountLocked(locked);

      let row: UserRow | undefined;
      if (company) {
        row = db.get<UserRow>(`${USER_SELECT} WHERE c.slug = ? AND u.username_key = ?`, company, usernameKey);
      } else {
        row = db.get<UserRow>(`${USER_SELECT} WHERE u.company_id IS NULL AND u.username_key = ?`, usernameKey);
      }
      if (!row) {
        await verifyDummy(body.password, config.scryptN);
        throttle.fail(ip, company, usernameKey);
        throw errors.invalidCredentials();
      }
      if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
        throw errors.accountLocked(Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000));
      }
      const ok = await verifyPassword(body.password, row.password_hash);
      if (!ok) {
        throttle.fail(ip, company, usernameKey);
        const fails = row.failed_logins + 1;
        if (fails >= config.lockoutMaxFailures) {
          db.run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', new Date(Date.now() + config.lockoutMinutes * 60_000).toISOString(), row.id);
        } else {
          db.run('UPDATE users SET failed_logins = ? WHERE id = ?', fails, row.id);
        }
        throw errors.invalidCredentials();
      }
      if (row.disabled || row.company_disabled) {
        throttle.fail(ip, company, usernameKey);
        throw errors.invalidCredentials();
      }
      throttle.success(ip, company, usernameKey);
      db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', row.id);
      const token = sessions.create(row.id, ip, req.headers['user-agent']);
      setSessionCookie(ctx, reply, token);
      return { user: toUser(row) };
    });

    app.post('/api/auth/logout', async (req, reply) => {
      if (req.auth) {
        sessions.revoke(req.auth.sessionId);
        ctx.disconnect.session(req.auth.sessionId);
      }
      clearSessionCookie(ctx, reply);
      return reply.code(204).send();
    });

    app.get('/api/auth/me', async (req) => {
      const auth = requireAuth(req, { allowPasswordChange: true });
      return { user: auth.user };
    });

    app.post('/api/auth/change-password', async (req, reply) => {
      const auth = requireAuth(req, { allowPasswordChange: true });
      const body = parse(changeSchema, req.body);
      const newPassword = validatePassword(body.newPassword, 'newPassword');
      const lockKey = auth.user.id;
      const lockedFor = throttle.lockedSeconds(req.ip, 'change-password', lockKey);
      if (lockedFor) throw errors.accountLocked(lockedFor);
      const row = db.get<UserRow>(`${USER_SELECT} WHERE u.id = ?`, auth.user.id)!;
      if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
        throttle.fail(req.ip, 'change-password', lockKey);
        throw errors.validation('Current password is incorrect', { field: 'currentPassword' });
      }
      if (body.currentPassword === newPassword) throw errors.validation('New password must differ from the current one', { field: 'newPassword' });
      throttle.success(req.ip, 'change-password', lockKey);
      const hash = await hashPassword(newPassword, config.scryptN);
      db.tx(() => {
        db.run('UPDATE users SET password_hash = ?, must_change_password = 0, failed_logins = 0, locked_until = NULL WHERE id = ?', hash, auth.user.id);
        sessions.revokeUser(auth.user.id, auth.sessionId);
      });
      ctx.disconnect.user(auth.user.id, auth.sessionId);
      return reply.code(204).send();
    });
  };
}
