import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { Brand } from './Brand';
import { homeFor } from './nav';
import { useTheme } from './theme';
import { IconMoon, IconSun } from './ui/icons';
import { UserMenu } from './UserMenu';

export interface Crumb { label: string; to?: string }

/** Top bar used by the admin pages: brand, breadcrumb, theme toggle and user menu. */
export function AppHeader({ crumbs = [] }: { crumbs?: Crumb[] }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <header className="app-header">
      <Link to={user ? homeFor(user) : '/'} className="app-header__brand" aria-label="MDHub home">
        <Brand size={26} />
      </Link>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="app-crumbs">
          <ol>
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`}>
                {c.to && i < crumbs.length - 1 ? (
                  <Link to={c.to}>{c.label}</Link>
                ) : (
                  <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="app-header__spacer" />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>
      <UserMenu />
    </header>
  );
}

export function PageShell({ crumbs, children }: { crumbs?: Crumb[]; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AppHeader crumbs={crumbs} />
      <main className="app-page">{children}</main>
    </div>
  );
}
