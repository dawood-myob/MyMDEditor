import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import type { AppContext } from '../src/context.js';

export const TMP_ROOT = path.join(process.cwd(), '.tmp');
export const PASSWORD = 'Test-Pass-12345';

export interface Env {
  app: FastifyInstance;
  ctx: AppContext;
  dir: string;
  close(): Promise<void>;
}

export async function makeEnv(overrides: Record<string, string> = {}): Promise<Env> {
  const dir = path.join(TMP_ROOT, `t-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  const config = loadConfig({
    DATA_DIR: path.join(dir, 'data'),
    CLIENT_DIR: path.join(dir, 'no-client'),
    LOG_LEVEL: 'silent',
    SCRYPT_N: '1024',
    PERSIST_DEBOUNCE_MS: '80',
    PERSIST_MAX_WAIT_MS: '400',
    ADMIN_USERNAME: 'root',
    ADMIN_PASSWORD: 'Root-Pass-12345',
    ...overrides,
  });
  const built = await createApp(config);
  await built.prepare();
  await built.app.ready();
  let closed = false;
  return {
    app: built.app,
    ctx: built.ctx,
    dir,
    async close() {
      if (closed) return;
      closed = true;
      await built.app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> {
  status: number;
  json: T;
  text: string;
  body: Buffer;
  headers: Record<string, string | string[] | number | undefined>;
}

export class Client {
  cookie = '';
  ip = '10.0.0.1';
  constructor(readonly env: Env) {}

  async request(method: string, url: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string>; raw?: Buffer | string } = {}): Promise<Res> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.csrf !== false) headers['x-requested-with'] = 'mdhub';
    if (this.cookie) headers.cookie = this.cookie;
    let payload: string | Buffer | undefined;
    if (opts.raw !== undefined) payload = opts.raw;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const res = await this.env.app.inject({ method: method as 'GET', url, headers, payload, remoteAddress: this.ip });
    for (const c of res.cookies) {
      if (c.name === 'mdhub_sid') this.cookie = c.value ? `mdhub_sid=${c.value}` : '';
    }
    const text = res.body;
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.statusCode, json, text, body: res.rawPayload, headers: res.headers };
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, body?: unknown) => this.request('POST', url, body ?? {});
  put = (url: string, body?: unknown) => this.request('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.request('PATCH', url, body ?? {});
  del = (url: string) => this.request('DELETE', url);

  async login(company: string | undefined, username: string, password = PASSWORD): Promise<Res> {
    return this.request('POST', '/api/auth/login', { ...(company !== undefined ? { company } : {}), username, password });
  }

  async upload(url: string, files: { name: string; data: Buffer | string }[]): Promise<Res> {
    const boundary = `----t${randomUUID().replace(/-/g, '')}`;
    const parts: Buffer[] = [];
    for (const f of files) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
      parts.push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
      parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return this.request('POST', url, undefined, { raw: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  }
}

/** Logs in as the bootstrap superadmin, completing the forced password change. */
export async function superadmin(env: Env): Promise<Client> {
  const c = new Client(env);
  env.ctx.db.run("UPDATE users SET must_change_password = 0 WHERE role = 'superadmin'");
  const r = await c.login(undefined, 'root', 'Root-Pass-12345');
  if (r.status !== 200) throw new Error(`superadmin login failed: ${r.status} ${r.text}`);
  return c;
}

export interface Tenant {
  id: string;
  slug: string;
  admin: Client;
  editor: Client;
  viewer: Client;
}

/** Creates a company through the platform API plus an editor and a viewer through the users API, all ready to use. */
export async function makeTenant(env: Env, sa: Client, slug: string): Promise<Tenant> {
  const created = await sa.post('/api/platform/companies', { name: `Company ${slug}`, slug, adminUsername: `${slug}-admin`, adminPassword: PASSWORD });
  if (created.status !== 201) throw new Error(`company create failed: ${created.status} ${created.text}`);
  const id = created.json.company.id as string;
  for (const [username, role] of [['editor', 'editor'], ['viewer', 'viewer']] as const) {
    const r = await sa.post(`/api/companies/${id}/users`, { username, password: PASSWORD, role });
    if (r.status !== 201) throw new Error(`user create failed: ${r.status} ${r.text}`);
  }
  env.ctx.db.run('UPDATE users SET must_change_password = 0 WHERE company_id = ?', id);
  const make = async (username: string): Promise<Client> => {
    const c = new Client(env);
    const r = await c.login(slug, username);
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${r.text}`);
    return c;
  };
  return { id, slug, admin: await make(`${slug}-admin`), editor: await make('editor'), viewer: await make('viewer') };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn: () => boolean | Promise<boolean>, timeoutMs = 5000, stepMs = 25): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}
