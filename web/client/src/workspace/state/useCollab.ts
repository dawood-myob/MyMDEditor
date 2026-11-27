import { useEffect, useRef, useState } from 'react';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { wsBaseUrl } from '../../api/client';
import type { User } from '../../api/types';
import { colorFromId } from '../lib/color';

export type ConnectionStatus = 'connected' | 'connecting' | 'offline';
export type SessionClosed = 'deleted' | 'forbidden' | 'unauthenticated' | null;

export interface CollabSession {
  documentId: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: WebsocketProvider;
  awareness: Awareness;
  undoManager: Y.UndoManager;
}

export interface CollabState {
  session: CollabSession | null;
  status: ConnectionStatus;
  /** first sync with the server finished (content is authoritative) */
  synced: boolean;
  /** true once the first sync completed; stays true while offline so local edits keep working */
  everSynced: boolean;
  closed: SessionClosed;
  /** true when the user cannot edit (viewer role, or the server said forbidden) */
  readOnly: boolean;
}

export interface CollabCallbacks {
  onClosed?: (reason: Exclude<SessionClosed, null>) => void;
}

export const displayNameOf = (user: Pick<User, 'displayName' | 'username'>): string => user.displayName || user.username;

/**
 * Owns the Y.Doc + WebsocketProvider for the open document. Lives above the panels so that preview/outline keep
 * working when the editor panel is hidden. Everything is torn down on document switch / unmount.
 * The client never seeds content: the server fills `content` after the first sync.
 */
export function useCollabSession(documentId: string | null, user: User, canEdit: boolean, callbacks: CollabCallbacks = {}): CollabState {
  const [state, setState] = useState<CollabState>({ session: null, status: 'connecting', synced: false, everSynced: false, closed: null, readOnly: !canEdit });
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!documentId) {
      setState({ session: null, status: 'connecting', synced: false, everSynced: false, closed: null, readOnly: !canEdit });
      return;
    }

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    const provider = new WebsocketProvider(wsBaseUrl(), documentId, ydoc, { connect: true });
    const awareness = provider.awareness;
    const undoManager = new Y.UndoManager(ytext, { captureTimeout: 500 });
    const colors = colorFromId(user.id);
    awareness.setLocalStateField('user', { id: user.id, name: displayNameOf(user), color: colors.color, colorLight: colors.colorLight });
    awareness.setLocalStateField('editing', false);

    const session: CollabSession = { documentId, ydoc, ytext, provider, awareness, undoManager };
    let disposed = false;
    setState({ session, status: 'connecting', synced: false, everSynced: false, closed: null, readOnly: !canEdit });

    const patch = (p: Partial<CollabState>) => {
      if (!disposed) {
        setState((s) => (s.session === session ? { ...s, ...p } : s));
      }
    };

    const onStatus = ({ status }: { status: 'connected' | 'disconnected' | 'connecting' }) => {
      patch({ status: status === 'disconnected' ? 'offline' : status });
    };

    const onSync = (isSynced: boolean) => patch(isSynced ? { synced: true, everSynced: true } : { synced: false });

    const onClose = (event: CloseEvent | null) => {
      const code = event?.code;
      if (code === 4404) {
        provider.disconnect();
        patch({ closed: 'deleted', status: 'offline' });
        cbRef.current.onClosed?.('deleted');
      } else if (code === 4403) {
        provider.disconnect();
        patch({ closed: 'forbidden', readOnly: true, status: 'offline' });
        cbRef.current.onClosed?.('forbidden');
      } else if (code === 4401) {
        provider.disconnect();
        patch({ closed: 'unauthenticated', status: 'offline' });
        cbRef.current.onClosed?.('unauthenticated');
      }
    };

    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.on('connection-close', onClose);

    return () => {
      disposed = true;
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      provider.off('connection-close', onClose);
      awareness.setLocalState(null);
      undoManager.destroy();
      provider.destroy();
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, user.id, user.displayName, user.username, canEdit]);

  return state;
}

export interface Collaborator {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  colorLight: string;
  editing: boolean;
}

interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
}

/** Remote collaborators, deduplicated by user id (a user with two tabs appears once, "editing" if any tab edits). */
export function collectCollaborators(awareness: AwarenessLike, selfUserId: string): Collaborator[] {
  const byUser = new Map<string, Collaborator>();
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) {
      return;
    }

    const u = state.user as { id?: string; name?: string; color?: string; colorLight?: string } | undefined;
    if (!u || typeof u.id !== 'string' || u.id === selfUserId) {
      return;
    }

    const fallback = colorFromId(u.id);
    const editing = state.editing === true;
    const existing = byUser.get(u.id);
    if (existing) {
      existing.editing ||= editing;
      return;
    }

    byUser.set(u.id, {
      clientId,
      userId: u.id,
      name: u.name || 'Unknown',
      color: u.color || fallback.color,
      colorLight: u.colorLight || fallback.colorLight,
      editing,
    });
  });

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function usePresence(awareness: Awareness | null, selfUserId: string): Collaborator[] {
  const [list, setList] = useState<Collaborator[]>([]);

  useEffect(() => {
    if (!awareness) {
      setList([]);
      return;
    }

    const update = () => {
      const next = collectCollaborators(awareness, selfUserId);
      setList((prev) =>
        prev.length === next.length && prev.every((p, i) => p.userId === next[i].userId && p.editing === next[i].editing && p.name === next[i].name) ? prev : next,
      );
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness, selfUserId]);

  return list;
}

export type SaveState = 'saved' | 'saving' | 'offline-dirty';

/** "Saving…" shortly after a local edit while connected, "Saved" once it settled, and a warning when edits only exist locally. */
export function useSaveState(session: CollabSession | null, status: ConnectionStatus): SaveState {
  const [dirtyWhileOffline, setDirtyWhileOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    setDirtyWhileOffline(false);
    setSaving(false);
    if (!session) {
      return;
    }

    let timer: number | undefined;
    const onUpdate = (_u: Uint8Array, origin: unknown) => {
      if (origin === session.provider) {
        return;
      }

      if (statusRef.current === 'connected') {
        setSaving(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setSaving(false), 1800);
      } else {
        setDirtyWhileOffline(true);
      }
    };

    session.ydoc.on('update', onUpdate);
    return () => {
      window.clearTimeout(timer);
      session.ydoc.off('update', onUpdate);
    };
  }, [session]);

  useEffect(() => {
    if (status === 'connected') {
      // pending local edits are flushed by the provider as part of the sync handshake
      const t = window.setTimeout(() => setDirtyWhileOffline(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  if (status !== 'connected' && dirtyWhileOffline) {
    return 'offline-dirty';
  }

  return saving ? 'saving' : 'saved';
}
