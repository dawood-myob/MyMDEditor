# MDHub - Enterprise Markdown Collaboration Platform

MDHub is the web evolution of the **MyMDEditor** desktop app. Companies get an isolated
workspace where teams organise policies, documentation and help articles as Markdown in
folders, and **edit the same document at the same time** (Google-Docs style).

Developed by **Dawood Ali** - [www.dawoodali.co.nz](https://www.dawoodali.co.nz)

## Features

| Area | Highlights |
|---|---|
| Workspace | IDE-style dockable panels (Explorer, Outline, Editor, Preview, History): minimise to a rail, maximise/restore, hide/show, float, drag-and-drop docking, presets, layout saved per user. Tabbed layout on small screens. |
| Multi-tenancy | Platform super-admin creates companies; every company has an isolated database scope and its own folder on disk. |
| Users and roles | Company Admin, Editor, Viewer (plus Platform Admin). scrypt password hashing, server-side sessions, login lockout, forced password change for the bootstrap admin. |
| Folders and documents | Create / rename / move (drag and drop) / delete folders and `.md` files. Full-text search (SQLite FTS5). |
| Versions | Automatic snapshots, manual labelled versions, line diff, restore. |
| Real-time collaboration | Yjs CRDT over WebSockets (y-websocket protocol): no overwritten changes, live cursors, presence avatars, offline buffering. |
| Import / export | Import `.md` files, folders, or ZIPs. Export a document as MD / HTML / DOCX / PDF, a folder or the whole workspace as ZIP (hierarchy preserved). |

## Architecture

```
Browser (React 19 + Vite, dockview, CodeMirror 6, y-codemirror.next)
   |  REST /api/*   SSE /api/events (tree refresh)   WebSocket /ws/<docId> (Yjs sync + awareness)
Node 24 server (Fastify 5, ws, yjs)         <- single container
   |  node:sqlite (WAL, FTS5, migrations)   <- source of truth
   |  disk mirror  DATA_DIR/companies/<companyId>/workspace/<folders>/<doc>.md
Docker volume  mdhub-data  ->  /data
```

* **Source of truth:** SQLite. Every change is also mirrored to plain `.md` files per company,
  so the content is always readable and backup friendly. A `reconcile()` runs at startup.
* **Isolation:** every query is scoped by company id taken from the session, never from the
  request; WebSocket access is checked at upgrade time. Covered by automated tests.
* **Collaboration:** the server keeps one `Y.Doc` per open document, seeds it from storage,
  debounces persistence, creates automatic versions and flushes on shutdown. Viewers are read-only
  at the protocol level.
* **Security:** HttpOnly SameSite=Strict session cookie, CSRF header (`X-Requested-With: mdhub`),
  CSP and security headers, Markdown rendered with raw HTML disabled plus DOMPurify in the client,
  zip-slip and zip-bomb protection, WebSocket origin check, rate limits.

The full API contract is in [`docs/API.md`](docs/API.md).

## Quick start (Docker Desktop)

```powershell
cd web
copy .env.example .env      # edit ADMIN_PASSWORD (and SEED_DEMO=true for a demo company)
docker compose up -d --build
```

Open <http://localhost:8080>.

* Platform admin: company field **empty**, username `admin`, password from `ADMIN_PASSWORD`
  (default `ChangeMe-Now-123`). You must change it at first login.
* With `SEED_DEMO=true`: company `acme`, users `acme-admin` / `editor` / `viewer`,
  password `Demo-Pass-1234` (demo only - never enable in production).

### First steps

1. Sign in as the platform admin, open **Platform**, create a company and its first admin.
2. Sign in as that company admin (company slug + username), add editors and viewers under **Manage users**.
3. Create folders and documents in the Explorer; open the same document from two browsers to see live collaboration.

## Configuration

Set via `.env` / compose environment (full list with extra tunables in `docs/API.md`).

| Variable | Default | Meaning |
|---|---|---|
| `MDHUB_PORT` | `8080` | host port (compose) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `ChangeMe-Now-123` | bootstrap platform admin, created once; password change is forced |
| `COOKIE_SECURE` | `false` | set `true` when served over HTTPS |
| `TRUST_PROXY` | `false` | set `true` behind a reverse proxy |
| `SEED_DEMO` | `false` | create demo company `acme` |
| `LOG_LEVEL` | `info` | log verbosity |
| `MAX_UPLOAD_MB` | `50` | import size limit |
| `ALLOWED_ORIGINS` | - | extra allowed WebSocket origins (when the Host header differs from the public URL) |
| `CHROMIUM_PATH` | `/usr/bin/chromium` in image | PDF export |

## Production deployment

* Put MDHub behind a TLS reverse proxy (Caddy, nginx, Traefik) and set `COOKIE_SECURE=true`,
  `TRUST_PROXY=true`. The proxy **must forward WebSocket upgrades** on `/ws/`.
* Change the bootstrap password immediately; do not leave `SEED_DEMO` on.
* The container runs as a non-root user with `no-new-privileges`.
* Health endpoint: `GET /api/health` (used by the Docker HEALTHCHECK).

## Backups and restore

All state lives in the `mdhub-data` volume (`/data`): `mdhub.sqlite` (SQLite) and `companies/`.

```powershell
# consistent backup (SQLite VACUUM INTO + zip of company folders) into /data/backups
docker compose exec mdhub node dist/backup-cli.js
docker cp mdhub:/data/backups ./backups
```

Restore: stop the stack, copy the backup contents back into the volume, start again.

```powershell
docker compose down
docker run --rm -v mdhub-data:/data -v ${PWD}/backups:/backup alpine sh -c "ls /backup"   # pick a backup
# copy the db / company folders into /data, then:
docker compose up -d
```

Documents are also plain `.md` files under `companies/<id>/workspace`, so a company can always be
recovered from its folder, and **Export workspace as ZIP** gives each company a self-service backup.

## Maintenance

* Update: `git pull && docker compose up -d --build` (database migrations run automatically at startup).
* Logs: `docker compose logs -f mdhub` (structured JSON, no secrets).
* Reset a forgotten admin password: use another admin, or the platform admin's *reset password*.
* Scaling path: the server is stateless apart from open-document rooms. To scale out, move SQLite to
  PostgreSQL and fan out Yjs updates through Redis pub/sub (or use sticky routing per document).

## Development

```powershell
# server (Node >= 22.13)
cd web\server;  npm install; $env:SEED_DEMO='true'; npm run dev      # http://localhost:8080
# client
cd web\client;  npm install; npm run dev                              # http://localhost:5173 (proxies /api and /ws)
```

Tests: `npm test` in `web\server` (API, tenant isolation, import/export, realtime convergence)
and in `web\client` (pure modules and components). `npm run typecheck` in both.

## Desktop app

The original Windows editor (`MyMDEditor`) is unchanged in purpose and now also has IDE-style panel chrome:
minimise-to-rail, maximise/restore, hide, dock left/right/top/bottom, swap and reset layout
(**Ctrl+Shift+M**, **Ctrl+Shift+Enter**, **Ctrl+Alt+1/2/3**, **Ctrl+Alt+0**; see Help, F1).
