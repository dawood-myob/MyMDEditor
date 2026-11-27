import type { ReactNode } from 'react';

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="app-empty">
      {icon && <div className="app-empty__icon">{icon}</div>}
      <h3 className="app-empty__title">{title}</h3>
      {children && <p className="app-empty__text muted">{children}</p>}
      {action && <div className="app-empty__action">{action}</div>}
    </div>
  );
}
