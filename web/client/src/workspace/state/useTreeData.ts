import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { DocumentFull, DocumentMeta, Folder, TreeResponse } from '../../api/types';
import { buildTree, type TreeModel } from '../lib/tree';
import { normalizeDocName } from '../lib/names';

export type TreeStatus = 'loading' | 'ready' | 'error';

export interface TreeActions {
  createFolder: (parentId: string | null, name: string) => Promise<Folder | null>;
  createDocument: (folderId: string | null, name: string, content?: string) => Promise<DocumentMeta | null>;
  rename: (kind: 'folder' | 'document', id: string, name: string) => Promise<boolean>;
  move: (kind: 'folder' | 'document', id: string, targetFolderId: string | null) => Promise<boolean>;
  remove: (kind: 'folder' | 'document', id: string) => Promise<boolean>;
}

export interface TreeData {
  model: TreeModel;
  status: TreeStatus;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  actions: TreeActions;
  /** true while the SSE stream is connected */
  live: boolean;
}

interface Raw { folders: Folder[]; documents: DocumentMeta[] }

const toMeta = (d: DocumentFull): DocumentMeta => ({
  id: d.id,
  folderId: d.folderId,
  name: d.name,
  size: d.size,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  updatedByName: d.updatedByName,
});

export function describeError(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiError) {
    return e.message || fallback;
  }

  return e instanceof Error ? e.message || fallback : fallback;
}

/**
 * Tree state: flat lists from `/api/tree`, kept fresh through the `/api/events` SSE stream (reconnect with backoff)
 * and mutated optimistically; failures roll back and are reported through `onError`.
 */
export function useTreeData(onError: (message: string) => void): TreeData {
  const [raw, setRaw] = useState<Raw>({ folders: [], documents: [] });
  const [status, setStatus] = useState<TreeStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const rawRef = useRef(raw);
  rawRef.current = raw;
  const seq = useRef(0);
  const pending = useRef(0);
  const dirtyWhilePending = useRef(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await api.get<TreeResponse>('/api/tree');
      if (!mounted.current || mine !== seq.current) {
        return;
      }

      setRaw({ folders: res.folders, documents: res.documents });
      setStatus('ready');
      setErrorMessage(null);
    } catch (e) {
      if (!mounted.current || mine !== seq.current) {
        return;
      }

      setErrorMessage(describeError(e, 'Could not load the workspace'));
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Server-sent events with exponential backoff. A refetch on every (re)connect catches anything missed while offline.
  useEffect(() => {
    let source: EventSource | null = null;
    let retry: number | undefined;
    let debounce: number | undefined;
    let attempt = 0;
    let stopped = false;

    const scheduleRefetch = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (pending.current > 0) {
          dirtyWhilePending.current = true;
        } else {
          void refresh();
        }
      }, 120);
    };

    const connect = () => {
      if (stopped || typeof EventSource === 'undefined') {
        return;
      }

      source = new EventSource('/api/events');
      source.addEventListener('open', () => {
        attempt = 0;
        setLive(true);
        scheduleRefetch();
      });
      source.addEventListener('tree', scheduleRefetch);
      source.addEventListener('document', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent<string>).data) as { id: string; updatedAt: string };
          setRaw((cur) => ({ ...cur, documents: cur.documents.map((d) => (d.id === data.id ? { ...d, updatedAt: data.updatedAt } : d)) }));
        } catch {
          /* ignore malformed payloads */
        }
      });
      source.addEventListener('error', () => {
        setLive(false);
        source?.close();
        source = null;
        if (!stopped) {
          const delay = Math.min(15000, 1000 * 2 ** attempt++);
          retry = window.setTimeout(connect, delay);
        }
      });
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      window.clearTimeout(debounce);
      source?.close();
    };
  }, [refresh]);

  /** Runs `apply` immediately (optimistic), then `call`; rolls back and reports on failure. */
  const optimistic = useCallback(
    async <T,>(apply: (cur: Raw) => Raw, call: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
      const snapshot = rawRef.current;
      pending.current++;
      setRaw(apply(snapshot));
      try {
        const value = await call();
        return { ok: true, value };
      } catch (e) {
        setRaw(snapshot);
        errorRef.current(describeError(e));
        return { ok: false };
      } finally {
        pending.current--;
        if (pending.current === 0) {
          dirtyWhilePending.current = false;
          void refresh();
        }
      }
    },
    [refresh],
  );

  const actions = useMemo<TreeActions>(
    () => ({
      async createFolder(parentId, name) {
        pending.current++;
        try {
          const { folder } = await api.post<{ folder: Folder }>('/api/folders', { parentId, name: name.trim() });
          setRaw((cur) => (cur.folders.some((f) => f.id === folder.id) ? cur : { ...cur, folders: [...cur.folders, folder] }));
          return folder;
        } catch (e) {
          errorRef.current(describeError(e, 'Could not create the folder'));
          return null;
        } finally {
          pending.current--;
          if (pending.current === 0) void refresh();
        }
      },
      async createDocument(folderId, name, content) {
        pending.current++;
        try {
          const { document } = await api.post<{ document: DocumentFull }>('/api/documents', {
            folderId,
            name: normalizeDocName(name),
            ...(content !== undefined ? { content } : {}),
          });
          const meta = toMeta(document);
          setRaw((cur) => (cur.documents.some((d) => d.id === meta.id) ? cur : { ...cur, documents: [...cur.documents, meta] }));
          return meta;
        } catch (e) {
          errorRef.current(describeError(e, 'Could not create the document'));
          return null;
        } finally {
          pending.current--;
          if (pending.current === 0) void refresh();
        }
      },
      async rename(kind, id, name) {
        const clean = kind === 'document' ? normalizeDocName(name) : name.trim();
        const res = await optimistic(
          (cur) =>
            kind === 'folder'
              ? { ...cur, folders: cur.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)) }
              : { ...cur, documents: cur.documents.map((d) => (d.id === id ? { ...d, name: clean } : d)) },
          () => (kind === 'folder' ? api.patch(`/api/folders/${id}`, { name: clean }) : api.patch(`/api/documents/${id}`, { name: clean })),
        );
        return res.ok;
      },
      async move(kind, id, target) {
        const res = await optimistic(
          (cur) =>
            kind === 'folder'
              ? { ...cur, folders: cur.folders.map((f) => (f.id === id ? { ...f, parentId: target } : f)) }
              : { ...cur, documents: cur.documents.map((d) => (d.id === id ? { ...d, folderId: target } : d)) },
          () => (kind === 'folder' ? api.patch(`/api/folders/${id}`, { parentId: target }) : api.patch(`/api/documents/${id}`, { folderId: target })),
        );
        return res.ok;
      },
      async remove(kind, id) {
        const res = await optimistic(
          (cur) => {
            if (kind === 'document') {
              return { ...cur, documents: cur.documents.filter((d) => d.id !== id) };
            }

            const doomed = new Set<string>([id]);
            let grew = true;
            while (grew) {
              grew = false;
              for (const f of cur.folders) {
                if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
                  doomed.add(f.id);
                  grew = true;
                }
              }
            }

            return {
              folders: cur.folders.filter((f) => !doomed.has(f.id)),
              documents: cur.documents.filter((d) => !d.folderId || !doomed.has(d.folderId)),
            };
          },
          () => (kind === 'folder' ? api.del(`/api/folders/${id}`) : api.del(`/api/documents/${id}`)),
        );
        return res.ok;
      },
    }),
    [optimistic, refresh],
  );

  const model = useMemo(() => buildTree(raw.folders, raw.documents), [raw]);
  return { model, status, errorMessage, refresh, actions, live };
}
