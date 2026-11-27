import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../lib/schema.js';
import { requireWorkspace } from '../../auth/guard.js';
import type { SearchService } from './service.js';

const query = z.object({
  q: z.string().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export function searchRoutes(svc: SearchService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/search', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { q, limit } = parse(query, req.query);
      return { results: svc.search(companyId, q, limit) };
    });
  };
}
