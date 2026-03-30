import { useEffect, useState } from 'react';
import {
  BarChart3,
  ArrowLeft,
  Blocks,
  ChevronLeft,
  ChevronRight,
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

const SIDEBAR_COLLAPSED_KEY = 'adminSidebarCollapsed';

const navItemClassName = ({ isActive, isCollapsed }: { isActive: boolean; isCollapsed: boolean }) =>
  cn(
    'admin-nav-item flex items-center rounded-xl border px-3 py-2.5 text-sm transition-colors',
    isCollapsed ? 'justify-center' : 'gap-3',
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((current) => {
      const next = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  };

  if (!isAuthenticated) {
    return null;
  }

  if (user?.role !== SystemRoles.ADMIN) {
    return <Navigate to="/c/new" replace={true} />;
  }

  return (
    <div className="admin-console admin-shell flex h-screen w-full flex-col p-4 lg:flex-row lg:gap-4">
      <div className="relative lg:self-stretch">
        <aside
          className={cn(
            'admin-sidebar mb-4 flex min-h-0 w-full flex-col rounded-3xl border p-4 transition-[width] duration-200 lg:mb-0 lg:h-full lg:flex-shrink-0',
            isCollapsed ? 'lg:w-[88px]' : 'lg:w-80',
          )}
        >
          <div className="admin-raised rounded-2xl border p-4">
            <div className={cn('flex items-center', isCollapsed ? 'justify-center' : 'gap-3')}>
              <div className="admin-subpanel flex h-10 w-10 items-center justify-center rounded-xl text-text-primary">
                <Shield className="h-5 w-5" aria-hidden="true" />
              </div>
              {!isCollapsed ? (
                <div className="text-sm font-medium text-text-primary">
                  {localize('com_ui_admin_console')}
                </div>
              ) : null}
            </div>
          </div>

          <nav
            className="mt-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2"
            aria-label={localize('com_ui_admin_console')}
          >
            {navGroups.map((group) => (
              <div key={group.headingKey} className="space-y-2">
                {!isCollapsed ? (
                  <div className="px-1 text-xs font-medium uppercase tracking-[0.22em] text-text-secondary">
                    {localize(group.headingKey)}
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={isCollapsed ? localize(item.labelKey) : undefined}
                        aria-label={isCollapsed ? localize(item.labelKey) : undefined}
                        className={(props) => navItemClassName({ ...props, isCollapsed })}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        {!isCollapsed ? <span>{localize(item.labelKey)}</span> : null}
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
              title={isCollapsed ? localize('com_ui_admin_back_to_chat') : undefined}
              aria-label={isCollapsed ? localize('com_ui_admin_back_to_chat') : undefined}
              className={cn(
                'admin-subpanel rounded-2xl border px-4 py-3 text-sm text-text-primary transition-colors',
                isCollapsed ? 'flex items-center justify-center' : 'flex items-center gap-2',
              )}
            >
              <ArrowLeft className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed ? <span>{localize('com_ui_admin_back_to_chat')}</span> : null}
            </Link>
          </div>
        </aside>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={localize(isCollapsed ? 'com_nav_open_sidebar' : 'com_nav_close_sidebar')}
          title={localize(isCollapsed ? 'com_nav_open_sidebar' : 'com_nav_close_sidebar')}
          className="admin-subpanel absolute right-[-28px] top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border text-text-primary shadow-sm transition-colors hover:text-foreground lg:flex"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <main className="admin-main min-h-0 flex-1 overflow-auto rounded-3xl border p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
