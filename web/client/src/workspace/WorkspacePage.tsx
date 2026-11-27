import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../app/auth';
import '../styles/workspace.css';
import { WorkspaceHeader } from './header/WorkspaceHeader';
import { DockHost } from './layout/DockHost';
import type { DockController } from './layout/DockController';
import { useDockSnapshot } from './layout/DockContext';
import { MobileLayout } from './layout/MobileLayout';
import { useMediaQuery } from './layout/useMediaQuery';
import { DialogProvider } from './ui/Dialogs';
import { ToastProvider } from './ui/Toast';
import { WorkspaceProvider } from './state/WorkspaceContext';

function Shell() {
  const { user } = useAuth();
  const narrow = useMediaQuery('(max-width: 899px)');
  const [ctl, setCtl] = useState<DockController | null>(null);
  const onController = useCallback((c: DockController | null) => setCtl(c), []);
  const snap = useDockSnapshot(ctl);
  const focus = snap.ui.preset === 'focus';

  // Esc: leave a maximised panel first, then Focus mode (ignored while a menu/dialog/search panel handled the key)
  useEffect(() => {
    if (!ctl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.ws-modal-backdrop, .ws-menu')) return;
      if (ctl.exitMaximize()) {
        e.preventDefault();
      } else if (ctl.getSnapshot().ui.preset === 'focus') {
        e.preventDefault();
        ctl.exitFocus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  if (!user) return null;

  return (
    <WorkspaceProvider user={user}>
      <div className={`ws-root${focus ? ' is-focus' : ''}`} data-testid="workspace">
        <WorkspaceHeader ctl={narrow ? null : ctl} />
        <main className="ws-main">
          {narrow ? <MobileLayout /> : <DockHost key={user.id} userId={user.id} focus={focus} onController={onController} />}
          {focus && !narrow && (
            <button type="button" className="btn ws-exit-focus" onClick={() => ctl?.exitFocus()}>
              Exit focus mode (Esc)
            </button>
          )}
        </main>
      </div>
    </WorkspaceProvider>
  );
}

/** Route target for `/` and `/d/:documentId`. */
export default function WorkspacePage() {
  return (
    <ToastProvider>
      <DialogProvider>
        <Shell />
      </DialogProvider>
    </ToastProvider>
  );
}
