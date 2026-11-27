import { api, ApiError } from '../../api/client';
import { filenameFromDisposition } from '../lib/format';
import { buildZip, type PickedFile } from '../lib/zip';

export interface ImportResult { imported: { folders: number; documents: number }; skipped: string[] }

function importUrl(folderId: string | null): string {
  return folderId ? `/api/import?folderId=${encodeURIComponent(folderId)}` : '/api/import';
}

/** Uploads .md and/or .zip files (multipart field `files`). */
export function importFiles(files: readonly File[], folderId: string | null): Promise<ImportResult> {
  const form = new FormData();
  for (const f of files) {
    form.append('files', f, f.name);
  }

  return api.upload<ImportResult>(importUrl(folderId), form);
}

/** Packs a picked folder into a ZIP in the browser (relative paths preserved) and uploads it. */
export async function importFolderAsZip(picked: readonly PickedFile[], folderId: string | null, name = 'folder'): Promise<ImportResult> {
  const blob = await buildZip(picked);
  return importFiles([new File([blob], `${name}.zip`, { type: 'application/zip' })], folderId);
}

export function describeImport(r: ImportResult): string {
  const parts = [`${r.imported.documents} document${r.imported.documents === 1 ? '' : 's'}`];
  if (r.imported.folders) {
    parts.push(`${r.imported.folders} folder${r.imported.folders === 1 ? '' : 's'}`);
  }

  return `Imported ${parts.join(' and ')}${r.skipped.length ? ` (${r.skipped.length} skipped)` : ''}.`;
}

/** Downloads through fetch so API errors (e.g. 501 export_unavailable) can be reported instead of saving an error page. */
export async function downloadFrom(url: string, fallbackName: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'mdhub' } });
  if (!res.ok) {
    let message = res.statusText || 'Download failed';
    let code = 'internal';
    try {
      const body = (await res.json()) as { error?: { code: string; message: string } };
      if (body.error) {
        message = body.error.message;
        code = body.error.code;
      }
    } catch {
      /* not JSON */
    }

    throw new ApiError(res.status, code, message);
  }

  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('content-disposition'), fallbackName);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return name;
}

export interface PickOptions { accept?: string; multiple?: boolean; directory?: boolean }

/** Opens the native file picker programmatically; resolves with an empty array when cancelled. */
export function pickFiles({ accept, multiple = true, directory = false }: PickOptions): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.setAttribute('data-testid', 'file-picker');
    if (accept) input.accept = accept;
    input.multiple = multiple;
    if (directory) {
      input.setAttribute('webkitdirectory', '');
    }

    let done = false;
    const finish = (files: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };

    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}
