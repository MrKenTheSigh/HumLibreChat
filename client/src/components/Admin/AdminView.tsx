import { useEffect, useState } from 'react';
import {
  BarChart3,
  ArrowLeft,
  Blocks,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coins,
  ClipboardCheck,
  Network,
  Layers3,
  MessagesSquare,
  Shield,
  ShieldAlert,
  Settings,
  Users,
  ShieldCheck,
} from 'lucide-react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { useGetAdminQuotaRequestsQuery } from '~/data-provider/Admin';
import {
  canAccessAdminConsole,
  canAccessAdminRoute,
  getAdminConsoleDefaultPath,
} from './adminAccess';

type NavItem = {
  icon: typeof Users;
  labelKey: TranslationKeys;
  to: string;
  roles?: SystemRoles[];
  badge?: 'pendingQuotaRequests';
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

const allNavGroups: NavGroup[] = [
  {
    headingKey: 'com_ui_admin_people',
    items: [
      {
        icon: Users,
        labelKey: 'com_ui_admin_users',
        to: '/d/admin/users',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: Building2,
        labelKey: 'com_ui_admin_departments',
        to: '/d/admin/departments',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: ShieldCheck,
        labelKey: 'com_ui_admin_roles',
        to: '/d/admin/roles',
        roles: [SystemRoles.ADMIN],
      },
    ],
  },
  {
    headingKey: 'com_ui_admin_access',
    items: [
      {
        icon: Layers3,
        labelKey: 'com_ui_admin_plans',
        to: '/d/admin/plans',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: Blocks,
        labelKey: 'com_ui_admin_channels',
        to: '/d/admin/channels',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: Settings,
        labelKey: 'com_ui_admin_system_settings',
        to: '/d/admin/system-settings',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: Coins,
        labelKey: 'com_ui_admin_quotas',
        to: '/d/admin/quotas',
        roles: [SystemRoles.ADMIN, SystemRoles.MANAGER],
      },
    ],
  },
  {
    headingKey: 'com_ui_admin_audit',
    items: [
      {
        icon: MessagesSquare,
        labelKey: 'com_ui_admin_conversations',
        to: '/d/admin/conversations',
        roles: [SystemRoles.ADMIN, SystemRoles.MANAGER, SystemRoles.AUDITOR],
      },
      {
        icon: BarChart3,
        labelKey: 'com_ui_admin_usage',
        to: '/d/admin/usage',
        roles: [SystemRoles.ADMIN, SystemRoles.MANAGER, SystemRoles.AUDITOR],
      },
      {
        icon: ClipboardCheck,
        labelKey: 'com_ui_admin_manager_reviews',
        to: '/d/admin/manager-reviews',
        roles: [SystemRoles.ADMIN],
      },
      {
        icon: ClipboardList,
        labelKey: 'com_ui_admin_audit_events',
        to: '/d/admin/activity-logs',
        roles: [SystemRoles.ADMIN, SystemRoles.AUDITOR],
      },
      {
        icon: ShieldAlert,
        labelKey: 'com_ui_admin_sensitive_information',
        to: '/d/admin/sensitive-information',
        roles: [SystemRoles.ADMIN, SystemRoles.MANAGER, SystemRoles.AUDITOR],
      },
    ],
  },
  {
    headingKey: 'com_ui_admin_experiments',
    items: [
      {
        icon: Network,
        labelKey: 'com_ui_admin_org_graph',
        to: '/d/admin/org-graph',
        roles: [SystemRoles.ADMIN, SystemRoles.MANAGER, SystemRoles.AUDITOR],
        badge: 'pendingQuotaRequests',
      },
    ],
  },
];

export default function AdminView() {
  const localize = useLocalize();
  const { isAuthenticated, user } = useAuthContext();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const userRole = user?.role as SystemRoles | undefined;
  const defaultAdminPath = getAdminConsoleDefaultPath(user?.role);
  const canReviewQuotaRequests = userRole === SystemRoles.ADMIN || userRole === SystemRoles.MANAGER;
  const pendingQuotaRequestsQuery = useGetAdminQuotaRequestsQuery(
    { status: 'pending', limit: 100 },
    {
      enabled: isAuthenticated && canAccessAdminConsole(user?.role) && canReviewQuotaRequests,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    },
  );
  const pendingQuotaRequestCount = canReviewQuotaRequests
    ? (pendingQuotaRequestsQuery.data?.requests.length ?? 0)
    : 0;

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

  if (!canAccessAdminConsole(user?.role)) {
    return <Navigate to="/c/new" replace={true} />;
  }

  if (!canAccessAdminRoute(userRole, location.pathname)) {
    return <Navigate to={defaultAdminPath} replace={true} />;
  }

  const navGroups = allNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.roles == null || item.roles.includes(userRole as SystemRoles),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (navGroups.length === 0) {
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
                    const showPendingQuotaBadge =
                      item.badge === 'pendingQuotaRequests' && pendingQuotaRequestCount > 0;

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={isCollapsed ? localize(item.labelKey) : undefined}
                        aria-label={isCollapsed ? localize(item.labelKey) : undefined}
                        className={(props) => navItemClassName({ ...props, isCollapsed })}
                      >
                        <span className="relative inline-flex flex-shrink-0">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {showPendingQuotaBadge ? (
                            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-primary bg-amber-500" />
                          ) : null}
                        </span>
                        {!isCollapsed ? (
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <span className="truncate">{localize(item.labelKey)}</span>
                            {showPendingQuotaBadge ? (
                              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                                {pendingQuotaRequestCount}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
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
