import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, idParams, zId } from '../../lib/schema.js';
import { actorOf, requireWorkspace } from '../../auth/guard.js';
import type { DocumentService } from './service.js';

const createDoc = z.object({ folderId: zId.nullable().optional().default(null), name: z.string(), content: z.string().optional() });
const patchDoc = z.object({ name: z.string().optional(), folderId: zId.nullable().optional() });
const putContent = z.object({ content: z.string() });

export function documentRoutes(svc: DocumentService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post('/api/documents', async (req, reply) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.write');
      const body = parse(createDoc, req.body);
      return reply.code(201).send({ document: svc.create(companyId, actorOf(auth), body) });
    });

    app.get('/api/documents/:id', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { id } = parse(idParams, req.params);
      return { document: svc.get(companyId, id) };
    });

    app.patch('/api/documents/:id', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      const body = parse(patchDoc, req.body);
      return { document: svc.update(companyId, id, body) };
    });

    app.put('/api/documents/:id/content', async (req) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      const body = parse(putContent, req.body);
      return { document: svc.putContent(companyId, id, actorOf(auth), body.content) };
    });

    app.delete('/api/documents/:id', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      svc.remove(companyId, id);
      return reply.code(204).send();
    });
  };
}
