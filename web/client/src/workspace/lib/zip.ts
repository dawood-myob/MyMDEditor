import { strToU8, zipSync, type Zippable } from 'fflate';

export interface PickedFile {
  file: File;
  /** path relative to the picked folder root, with forward slashes */
  path: string;
}

/** Normalises a `webkitRelativePath`-style path: forward slashes, no empty / dot segments, no traversal. */
export function normalizeZipPath(path: string): string | null {
  const parts = path.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (parts.length === 0 || parts.includes('..')) {
    return null;
  }

  return parts.join('/');
}

export const isMarkdownName = (name: string): boolean => /\.(md|markdown)$/i.test(name);

/** Files from an `<input webkitdirectory>` as {file, path}; non-markdown files are skipped. */
export function pickMarkdownFiles(files: FileList | File[]): PickedFile[] {
  const out: PickedFile[] = [];
  for (const file of Array.from(files)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const path = normalizeZipPath(rel);
    if (path && isMarkdownName(file.name)) {
      out.push({ file, path });
    }
  }

  return out;
}

/** Builds a ZIP (stored, not compressed: markdown is small and the server inflates anyway) preserving relative paths. */
export async function buildZip(files: readonly PickedFile[]): Promise<Blob> {
  const entries: Zippable = {};
  for (const { file, path } of files) {
    entries[path] = [new Uint8Array(await file.arrayBuffer()), { level: 6 }];
  }

  if (Object.keys(entries).length === 0) {
    entries['.keep'] = strToU8('');
  }

  const bytes = zipSync(entries);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
}
