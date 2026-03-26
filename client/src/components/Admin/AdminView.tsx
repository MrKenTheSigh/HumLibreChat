import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { ArrowLeft, Blocks, Layers3, MessagesSquare, Shield, Users } from 'lucide-react';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

const navItemClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-surface-hover text-text-primary'
      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
  );

export default function AdminView() {
  const localize = useLocalize();
  const { isAuthenticated, user } = useAuthContext();

  if (!isAuthenticated) {
    return null;
  }

  if (user?.role !== SystemRoles.ADMIN) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary p-4 lg:flex-row lg:gap-4">
      <aside className="mb-4 w-full rounded-2xl border border-border-medium bg-surface-secondary p-4 lg:mb-0 lg:w-72 lg:flex-shrink-0">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-hover text-text-primary">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">
              {localize('com_ui_admin_console')}
            </div>
            <div className="text-xs text-text-secondary">{localize('com_ui_admin')}</div>
          </div>
        </div>
        <Link
          to="/c/new"
          className="mb-6 flex items-center gap-2 rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-hover"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_admin_back_to_chat')}
        </Link>
        <nav className="flex flex-col gap-2" aria-label={localize('com_ui_admin_console')}>
          <NavLink to="/d/admin/users" className={navItemClassName}>
            <Users className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_admin_users')}
          </NavLink>
          <NavLink to="/d/admin/plans" className={navItemClassName}>
            <Layers3 className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_admin_plans')}
          </NavLink>
          <NavLink to="/d/admin/channels" className={navItemClassName}>
            <Blocks className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_admin_channels')}
          </NavLink>
          <NavLink to="/d/admin/conversations" className={navItemClassName}>
            <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_admin_conversations')}
          </NavLink>
        </nav>
      </aside>
      <main className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-background p-6">
        <Outlet />
      </main>
    </div>
  );
}
