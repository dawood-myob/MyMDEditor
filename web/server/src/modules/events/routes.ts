import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { requireWorkspace } from '../../auth/guard.js';

export function eventRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    app.get('/api/events', (req, reply) => {
      const { auth, companyId } = requireWorkspace(req, 'workspace.read');
      const raw = reply.raw;
      reply.hijack();
      raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      });
      raw.write('retry: 3000\n\n');

      const write = (event: string, data: unknown): void => {
        if (!raw.writableEnded && !raw.destroyed) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const unsubscribe = ctx.bus.subscribe({
        companyId,
        userId: auth.user.id,
        sessionId: auth.sessionId,
        send: (m) => write(m.event, m.data),
        close: () => {
          clearInterval(ping);
          raw.end();
        },
      });
      const ping = setInterval(() => write('ping', { t: Date.now() }), 25_000);
      ping.unref();
      write('ping', { t: Date.now() });
      raw.on('close', () => {
        clearInterval(ping);
        unsubscribe();
      });
    });
  };
}
