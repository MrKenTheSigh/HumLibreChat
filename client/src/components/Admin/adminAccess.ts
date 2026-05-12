import { SystemRoles } from 'librechat-data-provider';

const ADMIN_CONSOLE_ROLES = new Set<string>([
  SystemRoles.ADMIN,
  SystemRoles.AUDITOR,
  SystemRoles.MANAGER,
]);

const MANAGER_ADMIN_PATHS = [
  '/d/admin/org-graph',
  '/d/admin/quotas',
  '/d/admin/conversations',
  '/d/admin/usage',
];

const AUDITOR_ADMIN_PATHS = [
  '/d/admin/org-graph',
  '/d/admin/conversations',
  '/d/admin/usage',
  '/d/admin/activity-logs',
];

const rolePaths: Partial<Record<SystemRoles, string[]>> = {
  [SystemRoles.MANAGER]: MANAGER_ADMIN_PATHS,
  [SystemRoles.AUDITOR]: AUDITOR_ADMIN_PATHS,
};

export function canAccessAdminConsole(role?: string | null) {
  return ADMIN_CONSOLE_ROLES.has(role ?? '');
}

export function getAdminConsoleDefaultPath(role?: string | null) {
  if (role === SystemRoles.ADMIN) {
    return '/d/admin/users';
  }

  if (role === SystemRoles.MANAGER) {
    return '/d/admin/org-graph';
  }

  if (role === SystemRoles.AUDITOR) {
    return '/d/admin/conversations';
  }

  return '/c/new';
}

export function canAccessAdminRoute(role: SystemRoles | string | undefined, pathname: string) {
  if (!canAccessAdminConsole(role)) {
    return false;
  }

  if (role === SystemRoles.ADMIN) {
    return true;
  }

  if (pathname === '/d/admin' || pathname === '/d/admin/') {
    return true;
  }

  const allowedPaths = rolePaths[role as SystemRoles] ?? [];
  return allowedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
