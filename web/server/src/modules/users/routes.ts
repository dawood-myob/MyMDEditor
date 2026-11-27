import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errors } from '../../lib/errors.js';
import { parse } from '../../lib/schema.js';
import { requirePermission } from '../../auth/guard.js';
import type { AuthContext } from '../../auth/sessions.js';
import type { CompanyService } from '../companies/service.js';
import type { UserService } from './service.js';

const paramsC = z.object({ companyId: z.string().max(64) });
const paramsCU = z.object({ companyId: z.string().max(64), userId: z.string().max(64) });
const assignable = z.enum(['admin', 'editor', 'viewer']);

const createSchema = z.object({
  username: z.string(),
  displayName: z.string().optional(),
  password: z.string(),
  role: assignable,
});

const patchSchema = z.object({
  displayName: z.string().optional(),
  role: assignable.optional(),
  disabled: z.boolean().optional(),
  password: z.string().optional(),
});

export function userRoutes(companies: CompanyService, users: UserService) {
  /** Company admin of that company or superadmin; anything else about another tenant is a 404. */
  const access = (req: FastifyRequest, companyId: string): AuthContext => {
    const auth = requirePermission(req, 'users.manage');
    if (auth.user.role !== 'superadmin' && auth.user.companyId !== companyId) throw errors.notFound('Company not found');
    if (!companies.find(companyId)) throw errors.notFound('Company not found');
    return auth;
  };

  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/companies/:companyId/users', async (req) => {
      const { companyId } = parse(paramsC, req.params);
      access(req, companyId);
      return { users: users.list(companyId) };
    });

    app.post('/api/companies/:companyId/users', async (req, reply) => {
      const { companyId } = parse(paramsC, req.params);
      access(req, companyId);
      const body = parse(createSchema, req.body);
      return reply.code(201).send({ user: await users.create(companyId, body) });
    });

    app.patch('/api/companies/:companyId/users/:userId', async (req) => {
      const { companyId, userId } = parse(paramsCU, req.params);
      const auth = access(req, companyId);
      const body = parse(patchSchema, req.body);
      return { user: await users.update(companyId, userId, auth.user.id, body) };
    });

    app.delete('/api/companies/:companyId/users/:userId', async (req, reply) => {
      const { companyId, userId } = parse(paramsCU, req.params);
      const auth = access(req, companyId);
      users.delete(companyId, userId, auth.user.id);
      return reply.code(204).send();
    });
  };
}
