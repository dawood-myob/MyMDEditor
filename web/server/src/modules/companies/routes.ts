import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, idParams } from '../../lib/schema.js';
import { requirePermission } from '../../auth/guard.js';
import { CompanyService } from './service.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().optional(),
  adminUsername: z.string(),
  adminPassword: z.string(),
  adminDisplayName: z.string().optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  disabled: z.boolean().optional(),
});

const deleteQuery = z.object({ confirm: z.string().optional() });

export function companyRoutes(svc: CompanyService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/platform/companies', async (req) => {
      requirePermission(req, 'platform.manage');
      return { companies: svc.list() };
    });

    app.post('/api/platform/companies', async (req, reply) => {
      requirePermission(req, 'platform.manage');
      const body = parse(createSchema, req.body);
      const company = await svc.create(body);
      return reply.code(201).send({ company });
    });

    app.patch('/api/platform/companies/:id', async (req) => {
      requirePermission(req, 'platform.manage');
      const { id } = parse(idParams, req.params);
      const body = parse(patchSchema, req.body);
      return { company: svc.update(id, body) };
    });

    app.delete('/api/platform/companies/:id', async (req, reply) => {
      requirePermission(req, 'platform.manage');
      const { id } = parse(idParams, req.params);
      const { confirm } = parse(deleteQuery, req.query);
      svc.delete(id, confirm);
      return reply.code(204).send();
    });
  };
}
