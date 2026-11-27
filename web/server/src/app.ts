import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import type { AppContext } from './context.js';
import { createDisconnect } from './context.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrations.js';
import { Mirror } from './storage/mirror.js';
import { EventBus } from './modules/events/bus.js';
import { RoomManager } from './realtime/rooms.js';
import { attachGateway, type Gateway } from './realtime/gateway.js';
import { SessionService } from './auth/sessions.js';
import { LoginThrottle } from './auth/throttle.js';
import { authHook } from './auth/guard.js';
import { authRoutes } from './auth/routes.js';
import { AppError, errors } from './lib/errors.js';
import { VersionService } from './modules/versions/service.js';
import { TreeService } from './modules/tree/service.js';
import { DocumentService } from './modules/documents/service.js';
import { SearchService } from './modules/search/service.js';
import { CompanyService } from './modules/companies/service.js';
import { UserService } from './modules/users/service.js';
import { ImportExportService } from './modules/importexport/service.js';
import { treeRoutes } from './modules/tree/routes.js';
import { documentRoutes } from './modules/documents/routes.js';
import { versionRoutes } from './modules/versions/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { companyRoutes } from './modules/companies/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { importExportRoutes } from './modules/importexport/routes.js';
import { eventRoutes } from './modules/events/routes.js';
import { bootstrapSuperadmin, seedDemo } from './seed.js';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  /** Runs migrations, bootstrap/seed and disk reconciliation. Called by `start`. */
  prepare(): Promise<void>;
}

const MB = 1024 * 1024;

export async function createApp(config: Config): Promise<BuiltApp> {
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '[redacted]' },
          },
    genReqId: () => randomUUID(),
    trustProxy: config.trustProxy,
    bodyLimit: config.quotas.maxDocBytes * 2 + 64 * 1024,
    routerOptions: { ignoreTrailingSlash: true },
  });

  const db = openDatabase(path.join(config.dataDir, 'mdhub.sqlite'));
  migrate(db);

  const log = app.log;
  const bus = new EventBus();
  const mirror = new Mirror(db, config.dataDir, log);
  const versions = new VersionService(db, config);
  const rooms = new RoomManager({ db, config, mirror, bus, versions, log });
  const sessions = new SessionService(db, config);
  const throttle = new LoginThrottle(config.lockoutMaxFailures, config.lockoutMinutes * 60_000, config.loginMaxPerMin);
  const ctx: AppContext = { config, db, mirror, bus, rooms, sessions, throttle, versions, log, disconnect: createDisconnect(rooms, bus) };

  const tree = new TreeService(ctx);
  const docs = new DocumentService(ctx);
  const search = new SearchService(ctx);
  const companies = new CompanyService(ctx);
  const users = new UserService(ctx, companies);
  const importExport = new ImportExportService(ctx, tree, docs);

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    hsts: config.cookieSecure ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimitPerMin,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/') || req.url.startsWith('/api/health') || req.url.startsWith('/api/events'),
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, context) => errors.rateLimited(Math.max(1, Math.ceil(context.ttl / 1000))),
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadMb * MB, files: 500, fields: 20, parts: 600, headerPairs: 200 },
  });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(errors.validation('Request body is not valid JSON'), undefined);
    }
  });

  app.addHook('onRequest', authHook(ctx));
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-request-id', req.id);
    if (req.url.startsWith('/api')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (reply.sent) return;
    if (err instanceof AppError) {
      if (err.headers) for (const [k, v] of Object.entries(err.headers)) reply.header(k, v);
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
    }
    const fe = err as FastifyError;
    const status = fe.statusCode ?? 500;
    if (status === 413) return reply.code(413).send({ error: { code: 'payload_too_large', message: 'Payload too large' } });
    if (status === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } });
    if (/UNIQUE constraint failed/i.test(fe.message ?? '')) {
      return reply.code(409).send({ error: { code: 'conflict', message: 'An item with that name already exists' } });
    }
    if (status >= 400 && status < 500) {
      return reply.code(400).send({ error: { code: 'validation', message: fe.message || 'Invalid request' } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal', message: 'Internal server error' } });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(authRoutes(ctx));
  await app.register(companyRoutes(companies));
  await app.register(userRoutes(companies, users));
  await app.register(treeRoutes(tree));
  await app.register(documentRoutes(docs));
  await app.register(versionRoutes(ctx, versions, docs));
  await app.register(searchRoutes(search));
  await app.register(importExportRoutes(ctx, importExport, docs));
  await app.register(eventRoutes(ctx));

  const indexFile = path.join(config.clientDir, 'index.html');
  const hasClient = fs.existsSync(indexFile);
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: config.clientDir,
      index: ['index.html'],
      wildcard: true,
      setHeaders: (res, filePath) => {
        const base = path.basename(filePath);
        if (base === 'index.html') res.header('cache-control', 'no-cache');
        else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.header('cache-control', 'public, max-age=31536000, immutable');
      },
    });
  } else {
    log.warn({ clientDir: config.clientDir }, 'client build not found; only the API is served');
  }

  app.setNotFoundHandler((req, reply) => {
    const p = req.url.split('?')[0] ?? '';
    const apiLike = p === '/api' || p.startsWith('/api/') || p === '/ws' || p.startsWith('/ws/');
    if (hasClient && !apiLike && (req.method === 'GET' || req.method === 'HEAD')) {
      return reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(fs.createReadStream(indexFile));
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });

  let gateway: Gateway | null = null;
  let purgeTimer: NodeJS.Timeout | null = null;

  app.addHook('onReady', async () => {
    gateway = attachGateway(app.server, { config, db, sessions, rooms, log });
    purgeTimer = setInterval(() => {
      try {
        sessions.purgeExpired();
      } catch (e) {
        log.warn({ err: e }, 'session purge failed');
      }
    }, 10 * 60_000);
    purgeTimer.unref();
  });

  app.addHook('preClose', async () => {
    if (purgeTimer) clearInterval(purgeTimer);
    bus.closeAll();
    gateway?.close();
    rooms.shutdown();
  });

  app.addHook('onClose', async () => {
    rooms.shutdown();
    db.close();
  });

  const prepare = async (): Promise<void> => {
    await bootstrapSuperadmin(ctx, companies);
    if (config.seedDemo) await seedDemo(ctx, companies, tree, docs);
    mirror.reconcileAll();
    sessions.purgeExpired();
  };

  return { app, ctx, prepare };
}
