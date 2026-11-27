import type { DocumentMeta, Folder } from '../../api/types';

export interface FolderNode {
  kind: 'folder';
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  children: TreeNode[];
}

export interface DocNode {
  kind: 'document';
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  doc: DocumentMeta;
}

export type TreeNode = FolderNode | DocNode;

export interface TreeModel {
  roots: TreeNode[];
  folders: Map<string, FolderNode>;
  documents: Map<string, DocNode>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural, case-insensitive comparison ("file2" < "file10"). */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Folders first, then documents; each group natural-sorted by name. */
export function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  return naturalCompare(a.name, b.name);
}

export function buildTree(folders: readonly Folder[], documents: readonly DocumentMeta[]): TreeModel {
  const folderNodes = new Map<string, FolderNode>();
  for (const f of folders) {
    folderNodes.set(f.id, { kind: 'folder', id: f.id, name: f.name, parentId: f.parentId, path: f.name, children: [] });
  }

  // A folder whose parent is unknown (or that would form a cycle) is shown at the root rather than lost.
  const roots: TreeNode[] = [];
  for (const node of folderNodes.values()) {
    const parent = node.parentId ? folderNodes.get(node.parentId) : undefined;
    if (parent && !createsCycle(folderNodes, node)) {
      parent.children.push(node);
    } else {
      node.parentId = parent && !createsCycle(folderNodes, node) ? node.parentId : null;
      roots.push(node);
    }
  }

  const documentNodes = new Map<string, DocNode>();
  for (const d of documents) {
    const parent = d.folderId ? folderNodes.get(d.folderId) : undefined;
    const node: DocNode = { kind: 'document', id: d.id, name: d.name, parentId: parent ? d.folderId : null, path: d.name, doc: d };
    documentNodes.set(d.id, node);
    (parent ? parent.children : roots).push(node);
  }

  const finish = (nodes: TreeNode[], prefix: string) => {
    nodes.sort(compareNodes);
    for (const n of nodes) {
      n.path = prefix ? `${prefix}/${n.name}` : n.name;
      if (n.kind === 'folder') {
        finish(n.children, n.path);
      }
    }
  };
  finish(roots, '');

  return { roots, folders: folderNodes, documents: documentNodes };
}

function createsCycle(folders: Map<string, FolderNode>, start: FolderNode): boolean {
  const seen = new Set<string>([start.id]);
  let cur = start.parentId ? folders.get(start.parentId) : undefined;
  while (cur) {
    if (seen.has(cur.id)) {
      return true;
    }

    seen.add(cur.id);
    cur = cur.parentId ? folders.get(cur.parentId) : undefined;
  }

  return false;
}

export interface VisibleRow {
  node: TreeNode;
  depth: number;
}

/** Rows currently visible given the set of expanded folder ids (used for rendering and keyboard navigation). */
export function flattenVisible(roots: readonly TreeNode[], expanded: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (nodes: readonly TreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (node.kind === 'folder' && expanded.has(node.id)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return rows;
}

/** True when `candidateId` is `folderId` itself or lives anywhere below it. */
export function isSameOrDescendantFolder(model: TreeModel, folderId: string, candidateId: string | null): boolean {
  let cur = candidateId ? model.folders.get(candidateId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === folderId) {
      return true;
    }

    seen.add(cur.id);
    cur = cur.parentId ? model.folders.get(cur.parentId) : undefined;
  }

  return false;
}

export function ancestorFolderIds(model: TreeModel, id: string): string[] {
  const node = model.documents.get(id) ?? model.folders.get(id);
  const out: string[] = [];
  let parent = node?.parentId ? model.folders.get(node.parentId) : undefined;
  while (parent && !out.includes(parent.id)) {
    out.push(parent.id);
    parent = parent.parentId ? model.folders.get(parent.parentId) : undefined;
  }

  return out;
}

export function childrenOf(model: TreeModel, folderId: string | null): TreeNode[] {
  return folderId ? model.folders.get(folderId)?.children ?? [] : model.roots;
}

export type MoveCheck =
  | { ok: true }
  | { ok: false; code: 'missing' | 'same' | 'cycle' | 'conflict'; message: string };

export interface MoveSource { kind: 'folder' | 'document'; id: string }

/** Client-side pre-check for drag-and-drop / "Move to..."; the API stays the authority (it answers 409 on cycles). */
export function validateMove(model: TreeModel, source: MoveSource, targetFolderId: string | null): MoveCheck {
  const node = source.kind === 'folder' ? model.folders.get(source.id) : model.documents.get(source.id);
  if (!node) {
    return { ok: false, code: 'missing', message: 'That item no longer exists.' };
  }

  if (targetFolderId && !model.folders.has(targetFolderId)) {
    return { ok: false, code: 'missing', message: 'The destination folder no longer exists.' };
  }

  if (node.parentId === targetFolderId) {
    return { ok: false, code: 'same', message: 'Already in that location.' };
  }

  if (source.kind === 'folder' && isSameOrDescendantFolder(model, source.id, targetFolderId)) {
    return { ok: false, code: 'cycle', message: 'A folder cannot be moved into itself or one of its subfolders.' };
  }

  const clash = childrenOf(model, targetFolderId).some(
    (c) => c.kind === source.kind && c.id !== source.id && c.name.toLowerCase() === node.name.toLowerCase(),
  );
  if (clash) {
    return { ok: false, code: 'conflict', message: `"${node.name}" already exists in the destination.` };
  }

  return { ok: true };
}

export function pathOfDocument(model: TreeModel, id: string | null): string | null {
  return id ? model.documents.get(id)?.path ?? null : null;
}

/** Folder ids a "Move to..." picker may offer for the given source (excludes the folder itself and its descendants). */
export function moveTargets(model: TreeModel, source: MoveSource): Array<{ id: string | null; path: string; depth: number }> {
  const out: Array<{ id: string | null; path: string; depth: number }> = [{ id: null, path: '(workspace root)', depth: 0 }];
  const walk = (nodes: readonly TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (n.kind !== 'folder') {
        continue;
      }

      if (source.kind === 'folder' && n.id === source.id) {
        continue;
      }

      out.push({ id: n.id, path: n.path, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(model.roots, 1);
  return out;
}
