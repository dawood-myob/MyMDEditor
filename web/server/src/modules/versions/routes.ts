import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse, idParams } from '../../lib/schema.js';
import { errors } from '../../lib/errors.js';
import { actorOf, requireWorkspace } from '../../auth/guard.js';
import type { DocumentService } from '../documents/service.js';
import type { VersionService } from './service.js';

const createVersion = z.object({ label: z.string().trim().max(120).optional().nullable() });
const vParams = z.object({ id: z.string().max(64), versionId: z.string().max(64) });

export function versionRoutes(ctx: AppContext, versions: VersionService, docs: DocumentService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/documents/:id/versions', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { id } = parse(idParams, req.params);
      return { versions: versions.list(companyId, id) };
    });

    app.post('/api/documents/:id/versions', async (req, reply) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.write');
      const { id } = parse(idParams, req.params);
      const body = parse(createVersion, req.body);
      const doc = docs.get(companyId, id);
      const version = versions.create(companyId, id, doc.content, { kind: 'manual', label: body.label || null, author: actorOf(auth) });
      if (!version) throw errors.internal();
      return reply.code(201).send({ version });
    });

    app.get('/api/documents/:id/versions/:versionId', async (req) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { id, versionId } = parse(vParams, req.params);
      return { version: versions.get(companyId, id, versionId) };
    });

    app.post('/api/documents/:id/versions/:versionId/restore', async (req) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.write');
      const { id, versionId } = parse(vParams, req.params);
      const target = versions.get(companyId, id, versionId);
      const current = docs.get(companyId, id);
      const actor = actorOf(auth);
      ctx.db.tx(() => {
        versions.create(companyId, id, current.content, {
          kind: 'restore',
          label: `Before restoring version of ${target.createdAt}`,
          author: actor,
          skipIfIdentical: true,
        });
      });
      return { document: docs.putContent(companyId, id, actor, target.content) };
    });
  };
}
