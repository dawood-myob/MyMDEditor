import type { Db } from './connection.js';

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const FTS_NAME = (alias: string) =>
  `CASE WHEN lower(${alias}.name) LIKE '%.md' THEN substr(${alias}.name, 1, length(${alias}.name) - 3) ELSE ${alias}.name END`;

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin','admin','editor','viewer')),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  CHECK ((role = 'superadmin' AND company_id IS NULL) OR (role <> 'superadmin' AND company_id IS NOT NULL))
);
CREATE UNIQUE INDEX ux_users_company_username ON users (COALESCE(company_id, ''), username_key);
CREATE INDEX ix_users_company ON users (company_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX ix_sessions_user ON sessions (user_id);
CREATE INDEX ix_sessions_expires ON sessions (expires_at);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_folders_sibling ON folders (company_id, COALESCE(parent_id, ''), name_key);
CREATE INDEX ix_folders_parent ON folders (parent_id);

CREATE TABLE documents (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  ystate BLOB,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  updated_by_name TEXT
);
CREATE UNIQUE INDEX ux_documents_sibling ON documents (company_id, COALESCE(folder_id, ''), name_key);
CREATE INDEX ix_documents_folder ON documents (folder_id);

CREATE TABLE versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT,
  label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('auto','manual','restore','import')),
  content TEXT NOT NULL,
  size INTEGER NOT NULL
);
CREATE INDEX ix_versions_doc ON versions (document_id, seq);

CREATE VIRTUAL TABLE documents_fts USING fts5(name, content, tokenize = 'unicode61 remove_diacritics 2');

CREATE TRIGGER documents_fts_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts (rowid, name, content) VALUES (new.seq, ${FTS_NAME('new')}, new.content);
END;
CREATE TRIGGER documents_fts_au AFTER UPDATE OF name, content ON documents BEGIN
  UPDATE documents_fts SET name = ${FTS_NAME('new')}, content = new.content WHERE rowid = new.seq;
END;
CREATE TRIGGER documents_fts_ad AFTER DELETE ON documents BEGIN
  DELETE FROM documents_fts WHERE rowid = old.seq;
END;
`,
  },
];

export function migrate(db: Db): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Set(db.all<{ id: number }>('SELECT id FROM schema_migrations').map((r) => r.id));
  let count = 0;
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.tx(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', m.id, m.name, new Date().toISOString());
    });
    count++;
  }
  return count;
}
