import crypto from 'node:crypto';
import type { AppContext } from './context.js';
import type { CompanyService } from './modules/companies/service.js';
import type { TreeService } from './modules/tree/service.js';
import type { DocumentService } from './modules/documents/service.js';

export const DEMO_PASSWORD = 'Demo-Pass-1234';

/** Creates the platform superadmin on first start when none exists. */
export async function bootstrapSuperadmin(ctx: AppContext, companies: CompanyService): Promise<void> {
  const { db, config, log } = ctx;
  const existing = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'");
  if ((existing?.n ?? 0) > 0) return;
  let password = config.adminPassword;
  const generated = !password;
  if (!password) password = `${crypto.randomBytes(12).toString('base64url')}-Aa1`;
  await companies.insertUser({
    companyId: null,
    username: config.adminUsername,
    displayName: 'Platform Administrator',
    password,
    role: 'superadmin',
    mustChangePassword: true,
  });
  if (generated) log.warn({ username: config.adminUsername, password }, 'ADMIN_PASSWORD not set: generated a one-time superadmin password (change it at first login)');
  else log.info({ username: config.adminUsername }, 'bootstrapped superadmin (password change required at first login)');
}

const WELCOME = `# Welcome to Acme Docs

This workspace is shared by everyone at **Acme Corp**. Documents are plain Markdown and are edited together in real time.

## Getting started

1. Browse the tree on the left, or press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search.
2. Open a document and start typing. Teammates see your cursor live.
3. Use the *History* panel to compare and restore earlier versions.

> **Tip:** viewers can read everything but cannot edit. Ask an admin if you need write access.

- [x] Read the welcome page
- [ ] Open the Policies folder
- [ ] Try the Markdown cheat sheet in Help
`;

const SECURITY = `# Information Security Policy

| Field | Value |
| ----- | ----- |
| Owner | Security Team |
| Review cycle | Annual |
| Classification | Internal |

## 1. Purpose

This policy defines how Acme Corp protects **customer data** and internal systems.

## 2. Requirements

- All laptops use full-disk encryption.
- Passwords are at least 12 characters and stored in the company password manager.
- Multi-factor authentication is mandatory for every production system.

### 2.1 Incident response

1. Report suspected incidents to \`security@acme.example\` within one hour.
2. The on-call engineer opens an incident channel.
3. A post-mortem is published within five business days.

## 3. Exceptions

Exceptions need written approval from the CISO.[^1]

[^1]: Chief Information Security Officer.
`;

const REMOTE = `# Remote Work Policy

Employees may work remotely up to **three days per week** after agreement with their manager.

## Equipment

| Item | Provided | Notes |
| ---- | :------: | ----- |
| Laptop | yes | Managed by IT |
| Monitor | yes | One per employee |
| Chair | stipend | Up to 300 EUR |

## Security reminders

- Use the VPN on untrusted networks.
- Lock your screen when away.
- Never store customer data on personal devices.
`;

const ARCH = `# Architecture Overview

The platform is a classic three-tier system.

\`\`\`mermaid
graph LR
  Browser --> API --> Database
\`\`\`

## Components

| Component | Technology | Responsibility |
| --------- | ---------- | -------------- |
| Web client | TypeScript | UI and editing |
| API | Node.js | Business logic |
| Storage | SQLite | Source of truth |

## Example request

\`\`\`ts
interface Document {
  id: string;
  name: string;
  content: string;
}

async function load(id: string): Promise<Document> {
  const res = await fetch(\`/api/documents/\${id}\`);
  if (!res.ok) throw new Error('failed');
  return (await res.json()).document;
}
\`\`\`

Inline code such as \`npm run build\` is rendered monospaced.
`;

const API = `# API Quick Reference

## Authentication

\`\`\`bash
curl -X POST https://docs.acme.example/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -H 'X-Requested-With: mdhub' \\
  -d '{"company":"acme","username":"editor","password":"***"}'
\`\`\`

## Status codes

| Code | Meaning |
| ---- | ------- |
| 200 | OK |
| 401 | Not signed in |
| 403 | Not allowed |
| 404 | Not found |

~~Basic auth~~ is no longer supported.
`;

const CHEAT = `# Markdown Cheat Sheet

## Text

**bold**, *italic*, ~~strikethrough~~ and \`inline code\`.

## Lists

- Bullet
  - Nested bullet
1. First
2. Second

- [x] Done
- [ ] To do

## Links and images

[MDHub](https://example.com) and a footnote.[^note]

[^note]: Footnotes appear at the bottom.

## Quote

> Simplicity is the ultimate sophistication.

## Table

| Left | Center | Right |
| :--- | :----: | ----: |
| a | b | c |

---

Happy writing!
`;

const FAQ = `# Frequently Asked Questions

## How do I reset my password?

Ask your company administrator to set a temporary password. You will be asked to choose a new one at your next sign-in.

## Can I export a document?

Yes. Use **Export** in the toolbar to download Markdown, HTML, PDF or Word. Admins can download the whole workspace as a ZIP.

## Why can't I edit?

Your account may have the *viewer* role.
`;

export async function seedDemo(ctx: AppContext, companies: CompanyService, tree: TreeService, docs: DocumentService): Promise<void> {
  const { db, log } = ctx;
  if (db.get('SELECT 1 AS x FROM companies WHERE slug = ?', 'acme')) return;
  const company = await companies.create({
    name: 'Acme Corp',
    slug: 'acme',
    adminUsername: 'acme-admin',
    adminPassword: DEMO_PASSWORD,
    adminDisplayName: 'Acme Admin',
  });
  db.run('UPDATE users SET must_change_password = 0 WHERE company_id = ?', company.id);
  await companies.insertUser({ companyId: company.id, username: 'editor', displayName: 'Demo Editor', password: DEMO_PASSWORD, role: 'editor', mustChangePassword: false });
  await companies.insertUser({ companyId: company.id, username: 'viewer', displayName: 'Demo Viewer', password: DEMO_PASSWORD, role: 'viewer', mustChangePassword: false });

  const admin = db.get<{ id: string }>("SELECT id FROM users WHERE company_id = ? AND role = 'admin'", company.id)!;
  const actor = { id: admin.id, name: 'Acme Admin' };
  const cid = company.id;
  const policies = tree.createFolder(cid, { parentId: null, name: 'Policies' });
  const documentation = tree.createFolder(cid, { parentId: null, name: 'Documentation' });
  const help = tree.createFolder(cid, { parentId: null, name: 'Help' });
  const engineering = tree.createFolder(cid, { parentId: documentation.id, name: 'Engineering' });

  docs.create(cid, actor, { folderId: null, name: 'Welcome.md', content: WELCOME });
  docs.create(cid, actor, { folderId: policies.id, name: 'Information Security.md', content: SECURITY });
  docs.create(cid, actor, { folderId: policies.id, name: 'Remote Work.md', content: REMOTE });
  docs.create(cid, actor, { folderId: documentation.id, name: 'Architecture.md', content: ARCH });
  docs.create(cid, actor, { folderId: engineering.id, name: 'API Reference.md', content: API });
  docs.create(cid, actor, { folderId: help.id, name: 'Markdown Cheat Sheet.md', content: CHEAT });
  docs.create(cid, actor, { folderId: help.id, name: 'FAQ.md', content: FAQ });
  log.info({ company: 'acme' }, 'seeded demo company (users: acme-admin, editor, viewer)');
}
