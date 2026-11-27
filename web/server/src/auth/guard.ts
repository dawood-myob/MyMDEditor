import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthContext } from './sessions.js';
import { can, type Permission } from './permissions.js';
import { errors } from '../lib/errors.js';
import { COOKIE_NAME, readCookie } from '../realtime/gateway.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: ctx.config.cookieSecure,
    path: '/',
    maxAge: ctx.sessions.ttlSeconds,
  });
}

export function clearSessionCookie(ctx: AppContext, reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: ctx.config.cookieSecure, path: '/' });
}

/** onRequest hook: CSRF header check for unsafe /api methods, then session resolution. */
export function authHook(ctx: AppContext) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const url = req.url;
    if (!(url === '/api' || url.startsWith('/api/') || url.startsWith('/api?'))) return;
    if (!SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'mdhub') throw errors.csrf();
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    if (!token) return;
    const res = ctx.sessions.resolve(token);
    if (res.status === 'ok') {
      req.auth = res.auth;
      if (res.refreshed) setSessionCookie(ctx, reply, token);
    } else {
      clearSessionCookie(ctx, reply);
    }
  };
}

export function requireAuth(req: FastifyRequest, opts: { allowPasswordChange?: boolean } = {}): AuthContext {
  const auth = req.auth;
  if (!auth) throw errors.unauthorized();
  if (auth.user.mustChangePassword && !opts.allowPasswordChange) {
    throw errors.forbidden('Password change required', { reason: 'password_change_required' });
  }
  return auth;
}

export function requirePermission(req: FastifyRequest, permission: Permission): AuthContext {
  const auth = requireAuth(req);
  if (!can(auth.user.role, permission)) throw errors.forbidden('Insufficient permissions');
  return auth;
}

/** Workspace endpoints: requires a company user with the given permission and returns its company id. */
export function requireWorkspace(req: FastifyRequest, permission: 'workspace.read' | 'workspace.write'): { auth: AuthContext; companyId: string } {
  const auth = requireAuth(req);
  if (!auth.user.companyId) throw errors.forbidden('Platform administrators have no workspace', { code: 'no_company' });
  if (!can(auth.user.role, permission)) throw errors.forbidden('Insufficient permissions');
  return { auth, companyId: auth.user.companyId };
}

export const actorOf = (auth: AuthContext) => ({ id: auth.user.id, name: auth.user.displayName || auth.user.username });
