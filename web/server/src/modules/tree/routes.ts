import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, idParams, zId } from '../../lib/schema.js';
import { requireWorkspace } from '../../auth/guard.js';
import type { TreeService } from './service.js';

const createFolder = z.object({ parentId: zId.nullable().optional().default(null), name: z.string() });
const patchFolder = z.object({ name: z.string().optional(), parentId: zId.nullable().optional() });

export function treeRoutes(svc: TreeService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/tree', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      return svc.tree(companyId);
    });

    app.post('/api/folders', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.write');
      const body = parse(createFolder, req.body);
      return reply.code(201).send({ folder: svc.createFolder(companyId, body) });
    });

    app.patch('/api/folders/:id', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      const body = parse(patchFolder, req.body);
      return { folder: svc.updateFolder(companyId, id, body) };
    });

    app.delete('/api/folders/:id', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      svc.deleteFolder(companyId, id);
      return reply.code(204).send();
    });
  };
}
