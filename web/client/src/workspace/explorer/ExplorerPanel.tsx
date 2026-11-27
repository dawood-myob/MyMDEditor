import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { canWrite } from '../../api/client';
import { uniqueName } from '../lib/names';
import {
  ancestorFolderIds,
  childrenOf,
  flattenVisible,
  validateMove,
  type MoveSource,
  type TreeModel,
  type TreeNode,
} from '../lib/tree';
import { useWorkspace } from '../state/WorkspaceContext';
import { describeImport, downloadFrom, importFiles, pickFiles } from '../state/transfer';
import type { TreeActions, TreeStatus } from '../state/useTreeData';
import { describeError } from '../state/useTreeData';
import { useDialogs } from '../ui/Dialogs';
import {
  IconChevronDown,
  IconChevronRight,
  IconCollapseAll,
  IconEdit,
  IconExport,
  IconFile,
  IconFilePlus,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconImport,
  IconMove,
  IconRefresh,
  IconTrash,
} from '../ui/icons';
import { MenuPopup, type MenuEntry } from '../ui/Menu';
import { useToast } from '../ui/Toast';
import { InlineName } from './InlineName';
import { MoveDialog } from './MoveDialog';
import { useExpanded } from './useExpanded';

export interface ExplorerViewProps {
  model: TreeModel;
  status: TreeStatus;
  errorMessage: string | null;
  live: boolean;
  actions: TreeActions;
  userId: string;
  canEdit: boolean;
  currentDocId: string | null;
  onOpen: (id: string | null) => void;
  onRefresh: () => void;
}

type Row =
  | { type: 'node'; node: TreeNode; depth: number }
  | { type: 'create'; parentId: string | null; kind: 'folder' | 'document'; depth: number };

interface CreateState { parentId: string | null; kind: 'folder' | 'document' }
interface MenuState { x: number; y: number; node: TreeNode | null }

function countDocuments(node: TreeNode): number {
  return node.kind === 'document' ? 1 : node.children.reduce((n, c) => n + countDocuments(c), 0);
}

function containsId(node: TreeNode, id: string | null): boolean {
  if (!id) return false;
  if (node.id === id) return true;
  return node.kind === 'folder' && node.children.some((c) => containsId(c, id));
}

export function ExplorerView(props: ExplorerViewProps) {
  const { model, status, errorMessage, live, actions, userId, canEdit, currentDocId, onOpen, onRefresh } = props;
  const dialogs = useDialogs();
  const toast = useToast();
  const { expanded, toggle, expandMany, collapseAll } = useExpanded(userId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moving, setMoving] = useState<{ source: MoveSource; name: string } | null>(null);
  const [drop, setDrop] = useState<{ target: string | null; ok: boolean; message: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const dragSource = useRef<MoveSource | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  // keep the open document visible in the tree
  useEffect(() => {
    if (currentDocId && model.documents.has(currentDocId)) {
      expandMany(ancestorFolderIds(model, currentDocId));
    }
  }, [currentDocId, model, expandMany]);

  const rows = useMemo<Row[]>(() => {
    const base = flattenVisible(model.roots, expanded);
    const out: Row[] = [];
    if (creating && creating.parentId === null) {
      out.push({ type: 'create', parentId: null, kind: creating.kind, depth: 0 });
    }

    for (const r of base) {
      out.push({ type: 'node', node: r.node, depth: r.depth });
      if (creating && r.node.kind === 'folder' && r.node.id === creating.parentId) {
        out.push({ type: 'create', parentId: creating.parentId, kind: creating.kind, depth: r.depth + 1 });
      }
    }

    return out;
  }, [model, expanded, creating]);

  const nodeRows = useMemo(() => rows.filter((r): r is Extract<Row, { type: 'node' }> => r.type === 'node'), [rows]);
  const tabStopId = focusedId && nodeRows.some((r) => r.node.id === focusedId) ? focusedId : (nodeRows[0]?.node.id ?? null);

  const focusRow = useCallback((id: string | null) => {
    focusPending.current = true;
    setFocusedId(id);
  }, []);

  useLayoutEffect(() => {
    if (focusPending.current && focusedId) {
      focusPending.current = false;
      containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(focusedId)}"]`)?.focus();
    }
  });

  const siblingsNames = (parentId: string | null, kind: 'folder' | 'document', exceptId?: string) =>
    childrenOf(model, parentId)
      .filter((c) => c.kind === kind && c.id !== exceptId)
      .map((c) => c.name);

  const targetFolderFor = (node: TreeNode | null): string | null => {
    if (!node) return null;
    return node.kind === 'folder' ? node.id : node.parentId;
  };

  const startCreate = (kind: 'folder' | 'document', parentId: string | null) => {
    if (!canEdit) return;
    if (parentId) toggle(parentId, true);
    setRenamingId(null);
    setCreating({ kind, parentId });
  };

  const focusedNode = focusedId ? model.folders.get(focusedId) ?? model.documents.get(focusedId) ?? null : null;
  const defaultParent = targetFolderFor(focusedNode ?? (currentDocId ? model.documents.get(currentDocId) ?? null : null));

  const commitCreate = async (name: string) => {
    const state = creating;
    setCreating(null);
    if (!state) return;
    if (state.kind === 'folder') {
      const folder = await actions.createFolder(state.parentId, name);
      if (folder) {
        toggle(folder.id, true);
        focusRow(folder.id);
      }
    } else {
      const doc = await actions.createDocument(state.parentId, name);
      if (doc) {
        onOpen(doc.id);
        focusRow(doc.id);
      }
    }
  };

  const commitRename = async (node: TreeNode, name: string) => {
    setRenamingId(null);
    await actions.rename(node.kind, node.id, name);
    focusRow(node.id);
  };

  const requestDelete = async (node: TreeNode) => {
    if (!canEdit) return;
    const docs = countDocuments(node);
    const ok = await dialogs.confirm({
      title: node.kind === 'folder' ? 'Delete folder' : 'Delete document',
      danger: true,
      confirmLabel: 'Delete',
      message:
        node.kind === 'folder' ? (
          <>
            Delete the folder <strong>{node.name}</strong> and everything in it ({docs} document{docs === 1 ? '' : 's'})? This cannot be undone.
          </>
        ) : (
          <>
            Delete <strong>{node.name}</strong>? Its version history is deleted as well. This cannot be undone.
          </>
        ),
    });
    if (!ok) return;
    const wasOpen = containsId(node, currentDocId);
    const done = await actions.remove(node.kind, node.id);
    if (done && wasOpen) onOpen(null);
  };

  const requestMove = (node: TreeNode) => setMoving({ source: { kind: node.kind, id: node.id }, name: node.name });

  const doMove = async (source: MoveSource, target: string | null) => {
    const check = validateMove(model, source, target);
    if (!check.ok) {
      toast.error(check.message);
      return;
    }

    const done = await actions.move(source.kind, source.id, target);
    if (done && target) toggle(target, true);
  };

  const exportFolder = async (node: TreeNode) => {
    if (node.kind !== 'folder') return;
    try {
      await downloadFrom(`/api/folders/${node.id}/export.zip`, `${node.name}.zip`);
    } catch (e) {
      toast.error(describeError(e, 'Export failed'));
    }
  };

  const importHere = async (folderId: string | null) => {
    const files = await pickFiles({ accept: '.md,.markdown,.zip', multiple: true });
    if (files.length === 0) return;
    try {
      const result = await importFiles(files, folderId);
      toast.success(describeImport(result));
      if (folderId) toggle(folderId, true);
      onRefresh();
    } catch (e) {
      toast.error(describeError(e, 'Import failed'));
    }
  };

  const menuItems = (node: TreeNode | null): MenuEntry[] => {
    const items: MenuEntry[] = [];
    const parent = node?.kind === 'folder' ? node.id : node ? node.parentId : null;
    if (node?.kind === 'document') {
      items.push({ id: 'open', label: 'Open', icon: <IconFile size={14} />, onSelect: () => onOpen(node.id) });
      items.push({
        id: 'download',
        label: 'Download as Markdown',
        icon: <IconExport size={14} />,
        onSelect: () => void downloadFrom(`/api/documents/${node.id}/export?format=md`, node.name).catch((e) => toast.error(describeError(e, 'Export failed'))),
      });
    }

    if (canEdit) {
      if (!node || node.kind === 'folder') {
        if (items.length) items.push({ type: 'separator', id: 's0' });
        items.push({ id: 'new-doc', label: 'New document', icon: <IconFilePlus size={14} />, onSelect: () => startCreate('document', parent) });
        items.push({ id: 'new-folder', label: 'New folder', icon: <IconFolderPlus size={14} />, onSelect: () => startCreate('folder', parent) });
      }

      if (node) {
        items.push({ type: 'separator', id: 's1' });
        items.push({ id: 'rename', label: 'Rename', icon: <IconEdit size={14} />, shortcut: 'F2', onSelect: () => setRenamingId(node.id) });
        items.push({ id: 'move', label: 'Move to…', icon: <IconMove size={14} />, onSelect: () => requestMove(node) });
      }

      if (!node || node.kind === 'folder') {
        items.push({ type: 'separator', id: 's2' });
        items.push({ id: 'import', label: 'Import here…', icon: <IconImport size={14} />, onSelect: () => void importHere(node ? node.id : null) });
      }
    }

    if (node?.kind === 'folder') {
      items.push({ id: 'export-folder', label: 'Export folder (ZIP)', icon: <IconExport size={14} />, onSelect: () => void exportFolder(node) });
    }

    if (canEdit && node) {
      items.push({ type: 'separator', id: 's3' });
      items.push({ id: 'delete', label: 'Delete', icon: <IconTrash size={14} />, shortcut: 'Del', danger: true, onSelect: () => void requestDelete(node) });
    }

    return items;
  };

  const openMenuForRow = (node: TreeNode, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setFocusedId(node.id);
    setMenu({ x: r.left + 24, y: r.bottom, node });
  };

  const activate = (node: TreeNode) => {
    setFocusedId(node.id);
    if (node.kind === 'folder') toggle(node.id);
    else onOpen(node.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renamingId || creating) return;
    const idx = nodeRows.findIndex((r) => r.node.id === tabStopId);
    const current = idx >= 0 ? nodeRows[idx] : null;
    const move = (i: number) => {
      const target = nodeRows[Math.max(0, Math.min(nodeRows.length - 1, i))];
      if (target) focusRow(target.node.id);
    };

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(idx - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(nodeRows.length - 1);
        break;
      case 'ArrowRight':
        if (current?.node.kind === 'folder') {
          e.preventDefault();
          if (!expanded.has(current.node.id)) toggle(current.node.id, true);
          else if (current.node.children[0]) focusRow(current.node.children[0].id);
        }
        break;
      case 'ArrowLeft':
        if (current) {
          e.preventDefault();
          if (current.node.kind === 'folder' && expanded.has(current.node.id)) toggle(current.node.id, false);
          else if (current.node.parentId) focusRow(current.node.parentId);
        }
        break;
      case 'Enter':
      case ' ':
        if (current) {
          e.preventDefault();
          activate(current.node);
        }
        break;
      case 'F2':
        if (current && canEdit) {
          e.preventDefault();
          setRenamingId(current.node.id);
        }
        break;
      case 'Delete':
        if (current && canEdit) {
          e.preventDefault();
          void requestDelete(current.node);
        }
        break;
      case 'ContextMenu':
        if (current) {
          e.preventDefault();
          const el = containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.node.id)}"]`);
          if (el) openMenuForRow(current.node, el);
        }
        break;
      case 'F10':
        if (e.shiftKey && current) {
          e.preventDefault();
          const el = containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(current.node.id)}"]`);
          if (el) openMenuForRow(current.node, el);
        }
        break;
      default:
    }
  };

  // ---- drag and drop -------------------------------------------------
  const dropTargetOf = (el: EventTarget | null): string | null => {
    const holder = (el as HTMLElement | null)?.closest?.('[data-drop-target]') as HTMLElement | null;
    const v = holder?.dataset.dropTarget;
    return v ? v : null;
  };

  const onDragStart = (e: DragEvent, node: TreeNode) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }

    dragSource.current = { kind: node.kind, id: node.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.name);
  };

  const clearDrag = () => {
    dragSource.current = null;
    setDrop(null);
    window.clearTimeout(hoverTimer.current);
  };

  const onDragOver = (e: DragEvent) => {
    const source = dragSource.current;
    if (!source) return;
    const target = dropTargetOf(e.target);
    const check = validateMove(model, source, target);
    if (check.ok) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }

    setDrop((cur) => (cur && cur.target === target && cur.ok === check.ok ? cur : { target, ok: check.ok, message: check.ok ? '' : check.message }));
    window.clearTimeout(hoverTimer.current);
    if (target && !expanded.has(target)) {
      hoverTimer.current = window.setTimeout(() => toggle(target, true), 700);
    }
  };

  const onDrop = (e: DragEvent) => {
    const source = dragSource.current;
    const target = dropTargetOf(e.target);
    clearDrag();
    if (!source) return;
    e.preventDefault();
    void doMove(source, target);
  };

  const onContextMenuBackground = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, node: null });
  };

  const empty = status === 'ready' && model.roots.length === 0 && !creating;

  return (
    <div className="ws-explorer" data-testid="explorer">
      <div className="ws-panel-toolbar" role="toolbar" aria-label="Explorer actions">
        {canEdit && (
          <>
            <button type="button" className="ws-iconbtn" aria-label="New document" title="New document" onClick={() => startCreate('document', defaultParent)}>
              <IconFilePlus />
            </button>
            <button type="button" className="ws-iconbtn" aria-label="New folder" title="New folder" onClick={() => startCreate('folder', defaultParent)}>
              <IconFolderPlus />
            </button>
          </>
        )}
        <button type="button" className="ws-iconbtn" aria-label="Collapse all folders" title="Collapse all" onClick={collapseAll}>
          <IconCollapseAll />
        </button>
        <button type="button" className="ws-iconbtn" aria-label="Refresh" title="Refresh" onClick={onRefresh}>
          <IconRefresh />
        </button>
        <span className="ws-spacer" />
        <span className={`ws-live${live ? ' is-live' : ''}`} role="status" title={live ? 'Live updates connected' : 'Live updates reconnecting…'}>
          <span className="ws-live-dot" aria-hidden="true" />
          <span className="sr-only">{live ? 'Live updates connected' : 'Live updates reconnecting'}</span>
        </span>
      </div>

      {!canEdit && (
        <div className="ws-readonly-note" role="note">
          View-only access
        </div>
      )}

      {status === 'loading' && (
        <div className="ws-skeleton" aria-busy="true" aria-label="Loading files">
          {[70, 55, 80, 60, 45, 65].map((w, i) => (
            <div key={i} className="ws-skeleton-row" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="ws-empty" role="alert">
          <p className="ws-empty-title">Could not load files</p>
          <p className="muted">{errorMessage}</p>
          <button type="button" className="btn" onClick={onRefresh}>
            Try again
          </button>
        </div>
      )}

      {empty && (
        <div className="ws-empty">
          <IconFolderOpen size={28} />
          <p className="ws-empty-title">No documents yet</p>
          <p className="muted">{canEdit ? 'Create your first document or import existing Markdown files.' : 'Nothing has been shared with you yet.'}</p>
          {canEdit && (
            <div className="ws-empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => startCreate('document', null)}>
                New document
              </button>
              <button type="button" className="btn" onClick={() => void importHere(null)}>
                Import
              </button>
            </div>
          )}
        </div>
      )}

      {status === 'ready' && !empty && (
        <div
          ref={containerRef}
          className={`ws-tree${drop && drop.target === null ? (drop.ok ? ' is-drop-ok' : ' is-drop-bad') : ''}`}
          role="tree"
          aria-label="Files"
          aria-multiselectable="false"
          data-drop-target=""
          onKeyDown={onKeyDown}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDrop(null);
              window.clearTimeout(hoverTimer.current);
            }
          }}
          onContextMenu={onContextMenuBackground}
        >
          {rows.map((row) => {
            if (row.type === 'create') {
              return (
                <div key={`create-${row.parentId}-${row.kind}`} className="ws-row is-editing" role="none" style={{ paddingLeft: 8 + row.depth * 14 }}>
                  <span className="ws-row-twisty" />
                  <span className="ws-row-icon">{row.kind === 'folder' ? <IconFolder size={15} /> : <IconFile size={15} />}</span>
                  <InlineName
                    initial={row.kind === 'folder' ? uniqueName('New folder', siblingsNames(row.parentId, 'folder')) : uniqueName('Untitled', siblingsNames(row.parentId, 'document'), '.md')}
                    kind={row.kind}
                    siblings={siblingsNames(row.parentId, row.kind)}
                    ariaLabel={row.kind === 'folder' ? 'New folder name' : 'New document name'}
                    onCommit={(n) => void commitCreate(n)}
                    onCancel={() => setCreating(null)}
                  />
                </div>
              );
            }

            const { node, depth } = row;
            const isFolder = node.kind === 'folder';
            const isOpen = isFolder && expanded.has(node.id);
            const selected = node.kind === 'document' && node.id === currentDocId;
            const dropHere = drop && isFolder && drop.target === node.id;
            const dropDoc = drop && node.kind === 'document' && drop.target === node.parentId && node.parentId !== null;
            const cls = [
              'ws-row',
              selected ? 'is-selected' : '',
              tabStopId === node.id ? 'is-focused' : '',
              dropHere || dropDoc ? (drop!.ok ? 'is-drop-ok' : 'is-drop-bad') : '',
            ]
              .filter(Boolean)
              .join(' ');
            const editing = renamingId === node.id;
            return (
              <div
                key={node.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={isFolder ? isOpen : undefined}
                aria-selected={selected}
                aria-label={node.name}
                data-node-id={node.id}
                data-kind={node.kind}
                data-drop-target={isFolder ? node.id : (node.parentId ?? '')}
                className={cls}
                style={{ paddingLeft: 8 + depth * 14 }}
                tabIndex={tabStopId === node.id ? 0 : -1}
                draggable={canEdit && !editing}
                title={node.path}
                onFocus={() => setFocusedId(node.id)}
                onClick={() => !editing && activate(node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFocusedId(node.id);
                  setMenu({ x: e.clientX, y: e.clientY, node });
                }}
                onDragStart={(e) => onDragStart(e, node)}
                onDragEnd={clearDrag}
              >
                <span className="ws-row-twisty" aria-hidden="true">
                  {isFolder ? isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} /> : null}
                </span>
                <span className="ws-row-icon" aria-hidden="true">
                  {isFolder ? isOpen ? <IconFolderOpen size={15} /> : <IconFolder size={15} /> : <IconFile size={15} />}
                </span>
                {editing ? (
                  <InlineName
                    initial={node.name}
                    kind={node.kind}
                    siblings={siblingsNames(node.parentId, node.kind, node.id)}
                    ariaLabel={`Rename ${node.name}`}
                    onCommit={(n) => void commitRename(node, n)}
                    onCancel={() => {
                      setRenamingId(null);
                      focusRow(node.id);
                    }}
                  />
                ) : (
                  <span className="ws-row-name">{node.name}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {drop && !drop.ok ? drop.message : ''}
      </div>
      {drop && !drop.ok && drop.message && <div className="ws-drop-hint">{drop.message}</div>}

      {menu && <MenuPopup items={menuItems(menu.node)} x={menu.x} y={menu.y} label="File actions" onClose={() => setMenu(null)} />}
      {moving && (
        <MoveDialog
          model={model}
          source={moving.source}
          name={moving.name}
          onClose={() => setMoving(null)}
          onMove={(target) => {
            const m = moving;
            setMoving(null);
            void doMove(m.source, target);
          }}
        />
      )}
    </div>
  );
}

/** Context-bound explorer used inside the workspace. */
export default function ExplorerPanel() {
  const ws = useWorkspace();
  return (
    <ExplorerView
      model={ws.tree.model}
      status={ws.tree.status}
      errorMessage={ws.tree.errorMessage}
      live={ws.tree.live}
      actions={ws.tree.actions}
      userId={ws.user.id}
      canEdit={ws.canEdit && canWrite(ws.user.role)}
      currentDocId={ws.documentId}
      onOpen={(id) => ws.openDocument(id)}
      onRefresh={() => void ws.tree.refresh()}
    />
  );
}
