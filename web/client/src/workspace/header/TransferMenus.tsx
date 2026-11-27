import { useToast } from '../ui/Toast';
import { ApiError } from '../../api/client';
import { describeError } from '../state/useTreeData';
import { describeImport, downloadFrom, importFiles, importFolderAsZip, pickFiles } from '../state/transfer';
import { pickMarkdownFiles } from '../lib/zip';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconExport, IconImport } from '../ui/icons';
import { MenuButton, type MenuEntry } from '../ui/Menu';

type DocFormat = 'md' | 'html' | 'pdf' | 'docx';
const FORMAT_LABEL: Record<DocFormat, string> = { md: 'Markdown (.md)', html: 'HTML (.html)', pdf: 'PDF (.pdf)', docx: 'Word (.docx)' };

function useTransfers() {
  const ws = useWorkspace();
  const toast = useToast();

  const run = async (label: string, task: () => Promise<string | void>) => {
    try {
      const out = await task();
      if (out) toast.success(out);
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        toast.error(`${label} is not available on this server (${err.message}).`);
      } else {
        toast.error(`${label} failed: ${describeError(err)}`);
      }
    }
  };

  const baseName = (name: string) => name.replace(/\.(md|markdown)$/i, '');

  return {
    ws,
    importMarkdown: () =>
      run('Import', async () => {
        const files = await pickFiles({ accept: '.md,.markdown', multiple: true });
        if (files.length === 0) return;
        const r = await importFiles(files, null);
        await ws.tree.refresh();
        return describeImport(r);
      }),
    importZip: () =>
      run('Import', async () => {
        const files = await pickFiles({ accept: '.zip,application/zip', multiple: false });
        if (files.length === 0) return;
        const r = await importFiles(files, null);
        await ws.tree.refresh();
        return describeImport(r);
      }),
    importFolder: () =>
      run('Import', async () => {
        const files = await pickFiles({ directory: true, multiple: true });
        const picked = pickMarkdownFiles(files);
        if (picked.length === 0) {
          toast.info('The selected folder contains no Markdown files.');
          return;
        }

        const r = await importFolderAsZip(picked, null, 'folder');
        await ws.tree.refresh();
        return describeImport(r);
      }),
    exportDoc: (format: DocFormat) =>
      run(`Export as ${format.toUpperCase()}`, async () => {
        const doc = ws.currentDoc;
        if (!doc) return;
        const name = await downloadFrom(`/api/documents/${encodeURIComponent(doc.id)}/export?format=${format}`, `${baseName(doc.name)}.${format}`);
        return `Exported ${name}`;
      }),
    exportFolder: () =>
      run('Export', async () => {
        const folderId = ws.currentDoc?.parentId;
        if (!folderId) return;
        const folder = ws.tree.model.folders.get(folderId);
        const name = await downloadFrom(`/api/folders/${encodeURIComponent(folderId)}/export.zip`, `${folder?.name ?? 'folder'}.zip`);
        return `Exported ${name}`;
      }),
    exportWorkspace: () =>
      run('Export', async () => {
        const name = await downloadFrom('/api/export/workspace.zip', 'workspace.zip');
        return `Exported ${name}`;
      }),
  };
}

/** Header "Import" menu. Not rendered for viewers. */
export function ImportMenu() {
  const t = useTransfers();
  if (!t.ws.canEdit) return null;
  const items: MenuEntry[] = [
    { id: 'imp-files', label: 'Markdown files…', onSelect: () => void t.importMarkdown() },
    { id: 'imp-folder', label: 'Folder…', onSelect: () => void t.importFolder() },
    { id: 'imp-zip', label: 'ZIP archive…', onSelect: () => void t.importZip() },
  ];
  return (
    <MenuButton label="Import" className="ws-menubtn" testId="menu-import" items={items}>
      <IconImport size={15} /> <span className="ws-menubtn-label">Import</span>
    </MenuButton>
  );
}

/** Header "Export" menu: current document (md/html/pdf/docx), current folder or whole workspace as ZIP. */
export function ExportMenu() {
  const t = useTransfers();
  const doc = t.ws.currentDoc;
  const inFolder = !!doc?.parentId;
  const items: MenuEntry[] = [
    { type: 'heading', id: 'h-doc', label: doc ? `Document “${doc.name}”` : 'Document' },
    ...(['md', 'html', 'pdf', 'docx'] as const).map<MenuEntry>((f) => ({ id: `exp-${f}`, label: FORMAT_LABEL[f], disabled: !doc, onSelect: () => void t.exportDoc(f) })),
    { type: 'separator', id: 's' },
    { id: 'exp-folder', label: 'Current folder (.zip)', disabled: !inFolder, onSelect: () => void t.exportFolder() },
    { id: 'exp-ws', label: 'Entire workspace (.zip)', onSelect: () => void t.exportWorkspace() },
  ];
  return (
    <MenuButton label="Export" className="ws-menubtn" testId="menu-export" items={items}>
      <IconExport size={15} /> <span className="ws-menubtn-label">Export</span>
    </MenuButton>
  );
}
