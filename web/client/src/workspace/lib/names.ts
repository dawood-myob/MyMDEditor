/** Client-side mirror of the server naming rules (see docs/API.md "Conventions"). */
const FORBIDDEN_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export const MAX_NAME_LENGTH = 120;

export function hasMdExtension(name: string): boolean {
  return /\.md$/i.test(name);
}

/** The server appends `.md` when it is missing; do the same locally so optimistic UI matches. */
export function normalizeDocName(name: string): string {
  const trimmed = name.trim();
  return hasMdExtension(trimmed) ? trimmed : `${trimmed}.md`;
}

/** Returns a human readable error or null when the name is acceptable. */
export function validateName(raw: string, kind: 'folder' | 'document'): string | null {
  const name = kind === 'document' ? normalizeDocName(raw) : raw.trim();
  const bare = kind === 'document' ? name.replace(/\.md$/i, '') : name;
  if (!raw.trim() || (kind === 'document' && !bare)) {
    return 'Name cannot be empty.';
  }

  if (name.length > MAX_NAME_LENGTH) {
    return `Name must be at most ${MAX_NAME_LENGTH} characters.`;
  }

  if (FORBIDDEN_CHARS.test(name)) {
    return 'Name cannot contain / \\ : * ? " < > | or control characters.';
  }

  if (name === '.' || name === '..' || bare === '.' || bare === '..') {
    return 'Name cannot be "." or "..".';
  }

  if (/[. ]$/.test(bare)) {
    return 'Name cannot end with a dot or a space.';
  }

  if (RESERVED.test(bare.split('.')[0])) {
    return 'That name is reserved by Windows.';
  }

  return null;
}

/** "Untitled.md", "Untitled 2.md", ... avoiding case-insensitive collisions with `existing`. */
export function uniqueName(base: string, existing: Iterable<string>, ext = ''): string {
  const taken = new Set(Array.from(existing, (n) => n.toLowerCase()));
  let candidate = `${base}${ext}`;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    candidate = `${base} ${i}${ext}`;
  }

  return candidate;
}
