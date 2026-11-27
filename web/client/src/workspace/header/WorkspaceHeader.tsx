import { useState } from 'react';
import { useTheme } from '../../app/theme';
import { UserMenu } from '../../app/UserMenu';
import type { DockController } from '../layout/DockController';
import { ViewMenu } from '../layout/ViewMenu';
import { SearchBox } from '../search/SearchBox';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconHelp, IconMoon, IconSun } from '../ui/icons';
import { ShortcutsDialog } from './ShortcutsDialog';
import { ExportMenu, ImportMenu } from './TransferMenus';

export function Breadcrumb() {
  const { currentDoc, documentId, tree } = useWorkspace();
  if (!documentId) {
    return (
      <nav className="ws-breadcrumb" aria-label="Current document">
        <span className="muted">No document open</span>
      </nav>
    );
  }

  if (!currentDoc) {
    return (
      <nav className="ws-breadcrumb" aria-label="Current document">
        <span className="muted">{tree.status === 'ready' ? 'Document unavailable' : 'Loading…'}</span>
      </nav>
    );
  }

  const segments = currentDoc.path.split('/').filter(Boolean);
  return (
    <nav className="ws-breadcrumb" aria-label="Current document" data-testid="breadcrumb">
      <ol>
        {segments.map((s, i) => (
          <li key={i} aria-current={i === segments.length - 1 ? 'page' : undefined} className={i === segments.length - 1 ? 'is-current' : undefined}>
            {s}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function WorkspaceHeader({ ctl }: { ctl: DockController | null }) {
  const { user } = useWorkspace();
  const { theme, toggle } = useTheme();
  const [help, setHelp] = useState(false);
  const company = user.companyName;

  return (
    <header className="ws-header" role="banner">
      <div className="ws-brand" title="MDHub">
        <span className="ws-logo" aria-hidden="true">
          M↓
        </span>
        <span className="ws-brand-name">MDHub</span>
        {company && <span className="ws-company" data-testid="company-name">{company}</span>}
      </div>
      <Breadcrumb />
      <SearchBox />
      <div className="ws-header-actions">
        <ViewMenu ctl={ctl} />
        <ImportMenu />
        <ExportMenu />
        <button type="button" className="ws-iconbtn" aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle} data-testid="theme-toggle">
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button type="button" className="ws-iconbtn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setHelp(true)} data-testid="help-button">
          <IconHelp size={16} />
        </button>
        <UserMenu />
      </div>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </header>
  );
}
