import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Forbidden, RedirectIfSignedIn, RequireAuth } from './app/guards';
import { Splash } from './app/Splash';
import AdminUsersPage from './pages/AdminUsersPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import PlatformPage from './pages/PlatformPage';

const WorkspacePage = lazy(() => import('./workspace/WorkspacePage'));

export default function App() {
  const workspace = (
    <RequireAuth roles={['admin', 'editor', 'viewer']}>
      <Suspense fallback={<Splash label="Opening workspace…" />}>
        <WorkspacePage />
      </Suspense>
    </RequireAuth>
  );

  return (
    <Routes>
      <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
      <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
      <Route path="/platform" element={<RequireAuth roles={['superadmin']}><PlatformPage /></RequireAuth>} />
      <Route
        path="/platform/companies/:companyId"
        element={<RequireAuth roles={['superadmin']}><CompanyDetailPage /></RequireAuth>}
      />
      <Route path="/admin/users" element={<RequireAuth roles={['admin']}><AdminUsersPage /></RequireAuth>} />
      <Route path="/" element={workspace} />
      <Route path="/d/:documentId" element={workspace} />
      <Route path="/forbidden" element={<Forbidden />} />
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
