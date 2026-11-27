# MDHub – API & protocol contract

Single source of truth shared by `web/server` and `web/client`. If you need to change it, change this file too.

* Stack: Node 24 (Docker) / any Node >= 22.13 locally, TypeScript, Fastify 5, `node:sqlite` (built-in, FTS5 available), Yjs + `ws`.
* Dev: server on `http://localhost:8080` (`PORT`), Vite dev server on `5173` proxying `/api`, `/ws`, to 8080 (ws enabled).
* Prod: the server also serves the built client (`web/client/dist`) with SPA fallback (anything not `/api` or `/ws` -> `index.html`).

## Conventions

* All endpoints are under `/api`, JSON in/out (`content-type: application/json`) unless stated.
* Authentication = opaque session token in cookie `mdhub_sid` (HttpOnly, SameSite=Strict, Secure when `COOKIE_SECURE=true`). Only a SHA-256 hash of the token is stored.
* CSRF: every non-GET/HEAD request MUST send header `X-Requested-With: mdhub`, otherwise `403 csrf`. (Cookie is SameSite=Strict as well.)
* Errors: HTTP status + body `{ "error": { "code": "snake_case", "message": "human readable", "details"?: any } }`.
  Codes: `validation` 400, `unauthorized` 401, `invalid_credentials` 401, `account_locked` 423, `forbidden` 403, `csrf` 403,
  `not_found` 404, `conflict` 409 (duplicate name etc.), `payload_too_large` 413, `rate_limited` 429, `internal` 500, `export_unavailable` 501.
* IDs are UUID strings. Timestamps are ISO-8601 UTC strings.
* Roles: `superadmin` (platform operator, no company, manages tenants only – can NOT read company documents),
  `admin` (company admin), `editor`, `viewer`.
* Permission matrix:
  * viewer: read tree/documents/versions/search/export, open realtime read-only.
  * editor: viewer + create/rename/move/delete folders & documents, edit content, create versions, restore versions, import.
  * admin: editor + manage that company's users.
  * superadmin: `/api/platform/*` and `/api/companies/:id/users*` of any company, `/api/auth/*`, health. Gets `403 forbidden` (code `no_company`) on workspace endpoints.
* Strict tenant isolation: every workspace query is scoped by the session's `companyId`; an id belonging to another company behaves as `404 not_found`.
* Names (folders, documents): 1-120 chars, no `/ \ : * ? " < > |` or control chars, not `.`/`..`, no trailing dot/space, not a Windows reserved name (CON, NUL, COM1...). Unique among siblings, case-insensitive. Document names must end with `.md` (server appends `.md` when missing; `.markdown` is not accepted).
* Password policy: >= 10 chars (max 200).
* Usernames: 3-40 chars `[A-Za-z0-9._@-]`, unique per company, case-insensitive. Company slug: 2-40 chars `[a-z0-9-]`, globally unique.

## Types

```ts
type Role = 'superadmin' | 'admin' | 'editor' | 'viewer';
interface User { id: string; username: string; displayName: string; role: Role; companyId: string | null;
  companyName: string | null; companySlug: string | null; mustChangePassword: boolean; disabled: boolean; createdAt: string; }
interface Company { id: string; name: string; slug: string; disabled: boolean; userCount: number; documentCount: number; createdAt: string; }
interface Folder { id: string; parentId: string | null; name: string; createdAt: string; }
interface DocumentMeta { id: string; folderId: string | null; name: string; size: number; createdAt: string; updatedAt: string; updatedByName: string | null; }
interface DocumentFull extends DocumentMeta { path: string /* "Policies/HR/Leave.md" */; content: string; }
interface VersionMeta { id: string; documentId: string; createdAt: string; authorName: string | null; label: string | null; kind: 'auto' | 'manual' | 'restore' | 'import'; size: number; }
interface VersionFull extends VersionMeta { content: string; }
interface SearchHit { documentId: string; name: string; path: string; snippet: string; }
```

Search snippets contain match markers: `\uE000` before a match, `\uE001` after it (private-use characters, so the client splits on them and never injects HTML).

## Auth

| Method & path | Body | Success |
|---|---|---|
| `POST /api/auth/login` | `{ company?: string /*slug; omit for superadmin*/, username, password }` | `200 { user }` + cookie |
| `POST /api/auth/logout` | - | `204` |
| `GET /api/auth/me` | - | `200 { user }` or `401` |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }` | `204` (clears `mustChangePassword`, revokes other sessions) |

Login failures always return the same `401 invalid_credentials` (no user enumeration). 5 consecutive failures lock the account for 15 minutes (`423 account_locked`). Login is also IP rate-limited (429). Disabled users / disabled companies cannot log in or keep using an existing session (`401`).

## Platform (superadmin only)

| | |
|---|---|
| `GET /api/platform/companies` | `{ companies: Company[] }` |
| `POST /api/platform/companies` | `{ name, slug?, adminUsername, adminPassword, adminDisplayName? }` -> `201 { company }` (creates the company, its storage dir and the first admin) |
| `PATCH /api/platform/companies/:id` | `{ name?, disabled? }` -> `{ company }` |
| `DELETE /api/platform/companies/:id?confirm=<slug>` | `204`; deletes all rows and the company's directory on disk. `400 validation` if confirm != slug |

## Users (company admin of that company, or superadmin)

| | |
|---|---|
| `GET /api/companies/:companyId/users` | `{ users: User[] }` |
| `POST /api/companies/:companyId/users` | `{ username, displayName?, password, role: 'admin'\|'editor'\|'viewer' }` -> `201 { user }` (new users have `mustChangePassword=true`) |
| `PATCH /api/companies/:companyId/users/:userId` | `{ displayName?, role?, disabled?, password? }` -> `{ user }` (changing password sets mustChangePassword and revokes that user's sessions) |
| `DELETE /api/companies/:companyId/users/:userId` | `204` |

Guards: you cannot delete/disable yourself; the last active admin of a company cannot be deleted, disabled or demoted. A company admin may only use their own `companyId` (else `404`).

## Workspace (editor+ to write, viewer+ to read)

| | |
|---|---|
| `GET /api/tree` | `{ folders: Folder[], documents: DocumentMeta[] }` (flat lists; client builds the tree) |
| `POST /api/folders` | `{ parentId: string\|null, name }` -> `201 { folder }` |
| `PATCH /api/folders/:id` | `{ name?, parentId? }` (rename / move; moving into itself or a descendant -> `409`) -> `{ folder }` |
| `DELETE /api/folders/:id` | `204` (recursive) |
| `POST /api/documents` | `{ folderId: string\|null, name, content? }` -> `201 { document: DocumentFull }` |
| `GET /api/documents/:id` | `{ document: DocumentFull }` (content is the live collaborative content if the doc is open) |
| `PATCH /api/documents/:id` | `{ name?, folderId? }` -> `{ document: DocumentFull }` |
| `PUT /api/documents/:id/content` | `{ content }` -> `{ document: DocumentFull }` (applied to the live Yjs doc so connected editors see it) |
| `DELETE /api/documents/:id` | `204` (live connections are closed with code 4404) |
| `GET /api/documents/:id/versions` | `{ versions: VersionMeta[] }` newest first |
| `POST /api/documents/:id/versions` | `{ label? }` -> `201 { version: VersionMeta }` (manual snapshot) |
| `GET /api/documents/:id/versions/:versionId` | `{ version: VersionFull }` |
| `POST /api/documents/:id/versions/:versionId/restore` | `{ document: DocumentFull }` (snapshots current content first as `kind: 'restore'`, then replaces live content) |
| `GET /api/search?q=text&limit=30` | `{ results: SearchHit[] }` (FTS5, prefix match on the last term, company scoped) |
| `GET /api/events` | Server-Sent Events stream (`text/event-stream`), company scoped. Events: `event: tree` (data `{}`; something in the tree changed -> refetch `/api/tree`), `event: document` (data `{ id, updatedAt }`), `event: ping` every 25s. |

Automatic versions: when the last editor disconnects (if content changed since the last version) and at most every 10 minutes while editing. Max 200 versions/doc kept (manual ones are never pruned). Identical consecutive content is not versioned twice.

## Import / export

| | |
|---|---|
| `POST /api/import?folderId=<uuid>` (multipart/form-data, field `files`, repeatable) | Each part is either a `.md` file (imported into `folderId` or root) or a `.zip` (hierarchy preserved; only `.md` entries imported; zip-slip/absolute paths rejected; non-md entries counted as skipped). Name conflicts are resolved by appending ` (2)`, ` (3)` ... -> `200 { imported: { folders: number, documents: number }, skipped: string[] }` |
| `GET /api/export/workspace.zip` | whole company workspace as ZIP preserving hierarchy |
| `GET /api/folders/:id/export.zip` | one folder subtree as ZIP |
| `GET /api/documents/:id/export?format=md\|html\|pdf\|docx` | attachment download. `html` = self-contained styled page, `pdf` = rendered with headless Chromium (`501 export_unavailable` if no browser), `docx` = Word document |

Markdown rendering for HTML/PDF/DOCX: `markdown-it` with `html: false` (raw HTML in markdown is NOT rendered, preventing stored XSS), GFM tables, task lists, footnotes, heading ids, highlight.js code highlighting.

## Realtime collaboration (Yjs)

* WebSocket endpoint: `GET /ws/<documentId>` (same origin, cookie auth; Origin header must match Host). Speaks the standard **y-websocket protocol**
  (message type `0` = sync via y-protocols/sync, `1` = awareness via y-protocols/awareness, `3` = auth message reserved) so the stock `y-websocket` `WebsocketProvider(wsBaseUrl + '/ws', documentId, ydoc)` works unchanged.
* Shared type: `ydoc.getText('content')` holds the markdown. The server seeds it from the stored document the first time the doc is opened (clients must never seed it).
* Viewers: the server answers sync step 1 and awareness but silently drops client->server document updates.
* Close codes: `4401` not authenticated, `4403` forbidden (other company / disabled), `4404` document not found or deleted, `1013` server busy.
* Awareness local state published by clients: `{ user: { id, name, color, colorLight } }`.
* Persistence: server debounces (1.5s, max 10s) and writes (a) the Yjs state + plain text to SQLite, (b) the FTS index, (c) the `.md` file on disk atomically, (d) flushes everything on last disconnect and on SIGTERM.

## Storage layout (server `DATA_DIR`, default `./data`, Docker volume `/data`)

```
<DATA_DIR>/mdhub.sqlite                      (WAL)
<DATA_DIR>/companies/<companyId>/workspace/  <- mirrors the folder tree: Policies/HR/Leave.md
<DATA_DIR>/backups/                          <- optional, written by `npm run backup` (SQLite online backup + zip of workspaces)
```

The database is the source of truth for structure; the disk mirror is updated on every create/rename/move/delete/save and re-synchronised on startup (`reconcile`). All disk paths are computed only from validated names and verified to stay inside the company root.

## Environment variables (server)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `0.0.0.0` | bind address |
| `DATA_DIR` | `./data` | persistent data root |
| `CLIENT_DIR` | `../client/dist` (prod image: `/app/client`) | static client files |
| `COOKIE_SECURE` | `false` | set `true` when served over HTTPS |
| `TRUST_PROXY` | `false` | honour `X-Forwarded-*` behind a reverse proxy |
| `ADMIN_USERNAME` | `admin` | bootstrap platform administrator (created only when no superadmin exists) |
| `ADMIN_PASSWORD` | random, printed once in the log | bootstrap password; `mustChangePassword` is always true for the bootstrap admin |
| `MAX_UPLOAD_MB` | `50` | multipart limit |
| `LOG_LEVEL` | `info` | pino level |
| `SEED_DEMO` | `false` | create a demo company `acme` (admin/editor/viewer users `acme-admin`, `editor`, `viewer`, password `Demo-Pass-1234`) with sample folders |
| `CHROMIUM_PATH` | autodetect (`/usr/bin/chromium`, Edge/Chrome on Windows) | for PDF export |

Additional tunables (all optional): `ALLOWED_ORIGINS` (comma list of extra allowed ws/CSRF origins), `SESSION_TTL_HOURS` (12, sliding), `SESSION_MAX_DAYS` (30, absolute), `RATE_LIMIT_PER_MIN` (1200 per IP), `LOGIN_MAX_PER_MIN` (30), `LOCKOUT_MAX_FAILURES` (5), `LOCKOUT_MINUTES` (15), `SCRYPT_N` (16384), `MAX_DOCS_PER_COMPANY` (10000), `MAX_FOLDERS_PER_COMPANY` (5000), `MAX_USERS_PER_COMPANY` (200), `MAX_DOC_MB` (5), `MAX_COMPANY_STORAGE_MB` (1024), `MAX_FOLDER_DEPTH` (20), `MAX_IMPORT_ZIP_ENTRIES` (5000), `MAX_IMPORT_UNZIPPED_MB` (200), `PERSIST_DEBOUNCE_MS` (1500), `PERSIST_MAX_WAIT_MS` (10000), `WS_MAX_CONNECTIONS` (2000), `CHROMIUM_NO_SANDBOX` (true). Quota breaches return `413 payload_too_large`.

## Server implementation notes (clarifications to the contract)

* **Forced password change**: while `mustChangePassword` is true, every endpoint except `/api/auth/*` returns `403 forbidden` with `details.reason = "password_change_required"`, and `/ws/*` closes with `4403`.
* `403 forbidden` for a user without a company carries `details.code = "no_company"`.
* Wrong `currentPassword` on change-password: `400 validation`, `details.field = "currentPassword"`.
* Last company admin / self-delete / self-disable guards respond `409 conflict`.
* Folder and document names share one sibling namespace (case-insensitive unique). Names are trimmed; a document name without `.md` gets it appended. A document stem of `.` or `..` is rejected.
* Import: zips merge into existing folders; name conflicts get a ` (2)` suffix. An archive containing unsafe paths (zip-slip, absolute, `..`) is rejected entirely with `400`; too many entries / too large uncompressed content gives `413`.
* The first change to a document creates an auto-version baseline of the previous content.
* WebSocket Origin must match `Host` (or `X-Forwarded-Host` when `TRUST_PROXY=true`) or be listed in `ALLOWED_ORIGINS`; a document of another company closes with `4403`. Logout, company disable and document delete close live sockets with `4401`/`4403`/`4404`.
* Backup: `npm run backup` (dev) or `node dist/backup-cli.js` (production) writes `backups/mdhub-<ts>.sqlite` (`VACUUM INTO`) and `companies-<ts>.zip`.
