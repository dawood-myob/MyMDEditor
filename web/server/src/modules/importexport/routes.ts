import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { attachment } from '../../lib/http.js';
import { parse, idParams, zId } from '../../lib/schema.js';
import { actorOf, requireWorkspace } from '../../auth/guard.js';
import type { DocumentService } from '../documents/service.js';
import type { ImportExportService, ImportFile } from './service.js';
import { buildHtmlPage, renderMarkdown, renderMarkdownForDocx } from './markdown.js';
import { renderPdf } from './pdf.js';

const importQuery = z.object({ folderId: zId.optional() });
const exportQuery = z.object({ format: z.enum(['md', 'html', 'pdf', 'docx']).default('md') });

const stem = (name: string): string => name.replace(/\.md$/i, '');

export function importExportRoutes(ctx: AppContext, svc: ImportExportService, docs: DocumentService) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post('/api/import', async (req) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.write');
      const { folderId } = parse(importQuery, req.query);
      if (!req.isMultipart()) throw errors.validation('Expected multipart/form-data with field "files"');
      const files: ImportFile[] = [];
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        if (part.fieldname !== 'files') {
          part.file.resume();
          continue;
        }
        const data = await part.toBuffer();
        files.push({ filename: part.filename || 'untitled.md', data });
      }
      return svc.importFiles(companyId, actorOf(auth), folderId ?? null, files);
    });

    app.get('/api/export/workspace.zip', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { filename, data } = svc.exportZip(companyId, null);
      return reply.header('content-type', 'application/zip').header('content-disposition', attachment(filename)).header('cache-control', 'no-store').send(data);
    });

    app.get('/api/folders/:id/export.zip', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { id } = parse(idParams, req.params);
      const { filename, data } = svc.exportZip(companyId, id);
      return reply.header('content-type', 'application/zip').header('content-disposition', attachment(filename)).header('cache-control', 'no-store').send(data);
    });

    app.get('/api/documents/:id/export', async (req, reply) => {
      const { companyId } = requireWorkspace(req, 'workspace.read');
      const { id } = parse(idParams, req.params);
      const { format } = parse(exportQuery, req.query);
      const doc = docs.get(companyId, id);
      const base = stem(doc.name);
      reply.header('cache-control', 'no-store');
      switch (format) {
        case 'md':
          return reply.header('content-type', 'text/markdown; charset=utf-8').header('content-disposition', attachment(doc.name)).send(doc.content);
        case 'html': {
          const html = buildHtmlPage(base, renderMarkdown(doc.content), { allowRemoteImages: true });
          return reply.header('content-type', 'text/html; charset=utf-8').header('content-disposition', attachment(`${base}.html`)).send(html);
        }
        case 'pdf': {
          const html = buildHtmlPage(base, renderMarkdown(doc.content), { allowRemoteImages: false });
          const pdf = await renderPdf(html, { executablePath: ctx.config.chromiumPath, noSandbox: ctx.config.chromiumNoSandbox });
          return reply.header('content-type', 'application/pdf').header('content-disposition', attachment(`${base}.pdf`)).send(pdf);
        }
        case 'docx': {
          const html = buildHtmlPage(base, renderMarkdownForDocx(doc.content), { allowRemoteImages: false });
          const { default: htmlToDocx } = await import('html-to-docx');
          const fn = (typeof htmlToDocx === 'function' ? htmlToDocx : (htmlToDocx as { default: typeof htmlToDocx }).default) as typeof htmlToDocx;
          const out = await fn(html, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false });
          const buf = Buffer.isBuffer(out) ? out : out instanceof Blob ? Buffer.from(await out.arrayBuffer()) : Buffer.from(out as ArrayBuffer);
          return reply
            .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            .header('content-disposition', attachment(`${base}.docx`))
            .send(buf);
        }
      }
    });
  };
}
