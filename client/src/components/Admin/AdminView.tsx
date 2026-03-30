import {
  BarChart3,
  ArrowLeft,
  Blocks,
  Layers3,
  MessagesSquare,
  Shield,
  Users,
  ShieldCheck,
} from 'lucide-react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

type NavItem = {
  icon: typeof Users;
  labelKey: TranslationKeys;
  to: string;
};

type NavGroup = {
  headingKey: TranslationKeys;
  items: NavItem[];
};

const navItemClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    'admin-nav-item flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
    isActive
      ? 'admin-nav-item-active text-text-primary'
      : 'text-text-secondary hover:text-text-primary',
  );

const navGroups: NavGroup[] = [
  {
    headingKey: 'com_ui_admin_people',
    items: [
      { icon: Users, labelKey: 'com_ui_admin_users', to: '/d/admin/users' },
      { icon: ShieldCheck, labelKey: 'com_ui_admin_roles', to: '/d/admin/roles' },
    ],
  },
  {
    headingKey: 'com_ui_admin_access',
    items: [
      { icon: Layers3, labelKey: 'com_ui_admin_plans', to: '/d/admin/plans' },
      { icon: Blocks, labelKey: 'com_ui_admin_channels', to: '/d/admin/channels' },
    ],
  },
  {
    headingKey: 'com_ui_admin_audit',
    items: [
      {
        icon: MessagesSquare,
        labelKey: 'com_ui_admin_conversations',
        to: '/d/admin/conversations',
      },
      { icon: BarChart3, labelKey: 'com_ui_admin_usage', to: '/d/admin/usage' },
    ],
  },
];

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
    <div className="admin-console admin-shell flex h-screen w-full flex-col p-4 lg:flex-row lg:gap-4">
      <aside className="admin-sidebar mb-4 flex w-full flex-col rounded-3xl border p-4 lg:mb-0 lg:w-80 lg:flex-shrink-0">
        <div className="admin-raised rounded-2xl border p-4">
          <div className="flex items-center gap-3">
            <div className="admin-subpanel flex h-10 w-10 items-center justify-center rounded-xl text-text-primary">
              <Shield className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="text-sm font-medium text-text-primary">
              {localize('com_ui_admin_console')}
            </div>
          </div>
        </div>

        <nav
          className="mt-6 flex flex-1 flex-col gap-5"
          aria-label={localize('com_ui_admin_console')}
        >
          {navGroups.map((group) => (
            <div key={group.headingKey} className="space-y-2">
              <div className="px-1 text-xs font-medium uppercase tracking-[0.22em] text-text-secondary">
                {localize(group.headingKey)}
              </div>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink key={item.to} to={item.to} className={navItemClassName}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {localize(item.labelKey)}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 border-t border-border-light pt-4">
          <Link
            to="/c/new"
            className="admin-subpanel flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_admin_back_to_chat')}
          </Link>
        </div>
      </aside>
      <main className="admin-main min-h-0 flex-1 overflow-auto rounded-3xl border p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
