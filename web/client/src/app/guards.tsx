import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from './auth';
import { destinationFor, safeNext } from './nav';
import { Splash } from './Splash';

/** Gate for every signed-in route: session check, forced password change and role access. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return <Splash />;
  }

  const here = location.pathname + location.search;
  if (user === null) {
    const target = safeNext(here);
    const next = target && target !== '/' ? `?next=${encodeURIComponent(target)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to={destinationFor(user, here)} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'superadmin') {
      return <Navigate to="/platform" replace />;
    }

    return <Forbidden />;
  }

  return <>{children}</>;
}

/** /login: signed-in users are sent on to wherever they belong. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [params] = useSearchParams();

  if (user === undefined) {
    return <Splash />;
  }

  if (user) {
    return <Navigate to={destinationFor(user, params.get('next'))} replace />;
  }

  return <>{children}</>;
}

export function Forbidden() {
  return (
    <div className="app-center">
      <div className="app-notice card">
        <p className="app-notice__code">403</p>
        <h1 className="app-notice__title">You don't have access to this page</h1>
        <p className="muted">Your role does not allow you to view this area. Ask a company administrator if you need access.</p>
        <Link className="btn btn-primary" to="/">
          Back to MDHub
        </Link>
      </div>
    </div>
  );
}
