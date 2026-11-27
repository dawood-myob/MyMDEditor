import { useEffect, useRef, useState, type ReactNode } from 'react';
import EditorPanel from '../editor/EditorPanel';
import ExplorerPanel from '../explorer/ExplorerPanel';
import OutlinePanel from '../outline/OutlinePanel';
import PreviewPanel from '../preview/PreviewPanel';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconEdit, IconEye, IconFolder, IconList } from '../ui/icons';
import { PanelBoundary } from '../ui/PanelBoundary';

type MobileTab = 'explorer' | 'editor' | 'preview' | 'outline';

const TABS: Array<{ id: MobileTab; label: string; icon: ReactNode; node: ReactNode }> = [
  { id: 'explorer', label: 'Files', icon: <IconFolder size={18} />, node: <ExplorerPanel /> },
  { id: 'editor', label: 'Editor', icon: <IconEdit size={18} />, node: <EditorPanel /> },
  { id: 'preview', label: 'Preview', icon: <IconEye size={18} />, node: <PreviewPanel /> },
  { id: 'outline', label: 'Outline', icon: <IconList size={18} />, node: <OutlinePanel /> },
];

/** Narrow screens: one panel at a time with a bottom tab bar (no docking). All panels stay mounted so state survives tab switches. */
export function MobileLayout() {
  const { documentId, bus } = useWorkspace();
  const [tab, setTab] = useState<MobileTab>(documentId ? 'editor' : 'explorer');
  const last = useRef(documentId);

  useEffect(() => {
    if (documentId && documentId !== last.current) setTab('editor');
    last.current = documentId;
  }, [documentId]);

  // outline clicks jump to the editor
  useEffect(() => bus.on('reveal', ({ from }) => from === 'outline' && setTab('editor')), [bus]);

  return (
    <div className="ws-mobile" data-testid="mobile-layout">
      <div className="ws-mobile-body">
        {TABS.map((t) => (
          <section key={t.id} id={`ws-mobile-${t.id}`} role="tabpanel" aria-label={t.label} hidden={tab !== t.id} className="ws-mobile-panel">
            <PanelBoundary name={t.label}>{t.node}</PanelBoundary>
          </section>
        ))}
      </div>
      <div className="ws-mobile-tabs" role="tablist" aria-label="Workspace sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`ws-mobile-${t.id}`}
            className={`ws-mobile-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
