import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { canWrite } from '../../api/client';
import type { User } from '../../api/types';
import { useToast } from '../ui/Toast';
import { WorkspaceBus } from './bus';
import { useCollabSession, type CollabState } from './useCollab';
import { useTreeData, type TreeData } from './useTreeData';
import type { DocNode } from '../lib/tree';

export interface WorkspaceCtx {
  user: User;
  canEdit: boolean;
  tree: TreeData;
  documentId: string | null;
  currentDoc: DocNode | null;
  openDocument: (id: string | null, opts?: { find?: string }) => void;
  collab: CollabState;
  bus: WorkspaceBus;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  }

  return v;
}

export function WorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const params = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const documentId = params.documentId ?? null;
  const canEdit = canWrite(user.role);
  const bus = useMemo(() => new WorkspaceBus(), []);

  const tree = useTreeData(toast.error);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const collab = useCollabSession(documentId, user, canEdit, {
    onClosed: (reason) => {
      if (reason === 'deleted') {
        toastRef.current.info('This document was deleted or is no longer available.');
        navigateRef.current('/', { replace: true });
      } else if (reason === 'forbidden') {
        toastRef.current.error('You no longer have permission to edit this document. It is now read-only.');
      } else {
        toastRef.current.error('Your session has expired or is invalid. Please sign in again.');
      }
    },
  });

  const openDocument = useCallback(
    (id: string | null, opts?: { find?: string }) => {
      if (id && opts?.find) {
        bus.pendingFind = { documentId: id, term: opts.find };
      }

      if (id === documentId) {
        // same document: nothing to navigate, but a find request must still be honoured
        if (id && opts?.find) {
          bus.emit('focus-editor');
        }

        return;
      }

      navigate(id ? `/d/${id}` : '/');
    },
    [bus, documentId, navigate],
  );

  const currentDoc = documentId ? tree.model.documents.get(documentId) ?? null : null;

  // The document vanished from the tree (deleted elsewhere / by us): leave it.
  useEffect(() => {
    if (documentId && tree.status === 'ready' && !tree.model.documents.has(documentId)) {
      const t = window.setTimeout(() => {
        // re-check after a grace period: a just-created doc may not be in the first tree response yet
        if (!tree.model.documents.has(documentId)) {
          navigateRef.current('/', { replace: true });
        }
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [documentId, tree.status, tree.model]);

  const value = useMemo<WorkspaceCtx>(
    () => ({ user, canEdit, tree, documentId, currentDoc, openDocument, collab, bus }),
    [user, canEdit, tree, documentId, currentDoc, openDocument, collab, bus],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
