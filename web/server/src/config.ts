import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  clientDir: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  adminUsername: string;
  adminPassword: string | null;
  maxUploadMb: number;
  logLevel: string;
  seedDemo: boolean;
  chromiumPath: string | null;
  chromiumNoSandbox: boolean;
  allowedOrigins: string[];
  sessionTtlHours: number;
  sessionMaxDays: number;
  rateLimitPerMin: number;
  loginMaxPerMin: number;
  lockoutMaxFailures: number;
  lockoutMinutes: number;
  scryptN: number;
  quotas: {
    maxDocuments: number;
    maxFolders: number;
    maxUsers: number;
    maxDocBytes: number;
    maxCompanyStorageBytes: number;
    maxFolderDepth: number;
    maxZipEntries: number;
    maxZipUncompressedBytes: number;
  };
  versions: { maxPerDocument: number; autoIntervalMs: number };
  persist: { debounceMs: number; maxWaitMs: number };
  wsMaxConnections: number;
}

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Env = Record<string, string | undefined>;

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function num(v: string | undefined, def: number, min = 0): number {
  if (v === undefined || v.trim() === '') return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : def;
}

export function loadConfig(env: Env = process.env): Config {
  const mb = 1024 * 1024;
  return {
    port: num(env.PORT, 8080, 0),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || './data'),
    clientDir: path.resolve(env.CLIENT_DIR || path.join(serverRoot, '..', 'client', 'dist')),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    adminUsername: env.ADMIN_USERNAME || 'admin',
    adminPassword: env.ADMIN_PASSWORD || null,
    maxUploadMb: num(env.MAX_UPLOAD_MB, 50, 1),
    logLevel: env.LOG_LEVEL || 'info',
    seedDemo: bool(env.SEED_DEMO, false),
    chromiumPath: env.CHROMIUM_PATH || null,
    chromiumNoSandbox: bool(env.CHROMIUM_NO_SANDBOX, true),
    allowedOrigins: (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sessionTtlHours: num(env.SESSION_TTL_HOURS, 12, 1),
    sessionMaxDays: num(env.SESSION_MAX_DAYS, 30, 1),
    rateLimitPerMin: num(env.RATE_LIMIT_PER_MIN, 1200, 1),
    loginMaxPerMin: num(env.LOGIN_MAX_PER_MIN, 30, 1),
    lockoutMaxFailures: num(env.LOCKOUT_MAX_FAILURES, 5, 1),
    lockoutMinutes: num(env.LOCKOUT_MINUTES, 15, 1),
    scryptN: num(env.SCRYPT_N, 16384, 1024),
    quotas: {
      maxDocuments: num(env.MAX_DOCS_PER_COMPANY, 10000, 1),
      maxFolders: num(env.MAX_FOLDERS_PER_COMPANY, 5000, 1),
      maxUsers: num(env.MAX_USERS_PER_COMPANY, 200, 1),
      maxDocBytes: Math.floor(num(env.MAX_DOC_MB, 5, 0.001) * mb),
      maxCompanyStorageBytes: Math.floor(num(env.MAX_COMPANY_STORAGE_MB, 1024, 0.001) * mb),
      maxFolderDepth: num(env.MAX_FOLDER_DEPTH, 20, 1),
      maxZipEntries: num(env.MAX_IMPORT_ZIP_ENTRIES, 5000, 1),
      maxZipUncompressedBytes: Math.floor(num(env.MAX_IMPORT_UNZIPPED_MB, 200, 0.001) * mb),
    },
    versions: { maxPerDocument: 200, autoIntervalMs: 10 * 60 * 1000 },
    persist: { debounceMs: num(env.PERSIST_DEBOUNCE_MS, 1500, 1), maxWaitMs: num(env.PERSIST_MAX_WAIT_MS, 10000, 1) },
    wsMaxConnections: num(env.WS_MAX_CONNECTIONS, 2000, 1),
  };
}
