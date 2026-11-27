import { useAuth } from '../app/auth';
import { PageShell } from '../app/AppHeader';
import { Forbidden } from '../app/guards';
import { UsersManager } from './UsersManager';

export default function AdminUsersPage() {
  const { user } = useAuth();
  if (!user || !user.companyId) {
    return <Forbidden />;
  }

  return (
    <PageShell crumbs={[{ label: user.companyName ?? 'Workspace', to: '/' }, { label: 'Users' }]}>
      <div className="app-page__head">
        <div>
          <p className="app-eyebrow">{user.companyName}</p>
          <h1 className="app-page__title">Users</h1>
          <p className="muted">Manage who can sign in to your company’s workspace and what they are allowed to do.</p>
        </div>
      </div>
      <UsersManager companyId={user.companyId} canManage currentUserId={user.id} />
    </PageShell>
  );
}

