import { useDeferredValue, useEffect, useState } from 'react';
import { CircleHelp, ArrowRight, Search, UserPlus, Users } from 'lucide-react';
import {
  OGDialog,
  OGDialogTitle,
  OGDialogPortal,
  OGDialogOverlay,
  OGDialogContent,
} from '@librechat/client';
import type { AdminUserSummary } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import {
  useGetAdminRolesQuery,
  useGetAdminUserQuery,
  useGetAdminUsersQuery,
} from '~/data-provider/Admin';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';
import AdminCreateUserCard from './AdminCreateUserCard';

function StatusBadge(props: { label: string; tone?: 'default' | 'primary' | 'warning' }) {
  const { label, tone = 'default' } = props;

  const toneClassName =
    tone === 'warning'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      : tone === 'primary'
        ? 'border-border-medium bg-background text-text-primary'
        : 'border-border-light bg-surface-hover text-text-secondary';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClassName}`}
    >
      {label}
    </span>
  );
}

function MetricCard(props: { label: string; value: ReactNode; emphasis?: boolean }) {
  const { label, value, emphasis = false } = props;

  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${
        emphasis ? 'border-border-medium bg-background' : 'border-border-light bg-surface-primary'
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">{label}</div>
      <div className="mt-2 min-h-[2.75rem] text-sm text-text-primary">{value}</div>
    </div>
  );
}

function AdminUserListRow(props: { user: AdminUserSummary }) {
  const { user } = props;
  const navigate = useNavigate();
  const localize = useLocalize();
  const userDetailQuery = useGetAdminUserQuery(user.id, { enabled: true });
  const detail = userDetailQuery.data;
  const displayName = user.name || user.username || localize('com_ui_unknown');
  const planLabel = detail?.plan ? detail.plan.name : localize('com_ui_none');
  const planSlug = detail?.plan?.slug;
  const balanceLabel =
    detail != null
      ? new Intl.NumberFormat().format(Math.round(detail.balance.tokenCredits))
      : '...';

  return (
    <button
      type="button"
      className="grid w-full gap-4 rounded-2xl border border-border-medium bg-background p-4 text-left transition-colors hover:bg-surface-hover"
      onClick={() => navigate(`/d/admin/users/${user.id}`)}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-base font-semibold text-text-primary">{displayName}</div>
            {detail?.roleManagement.isPrimaryAdminProtected && (
              <StatusBadge label={localize('com_ui_admin_protected_admin')} tone="warning" />
            )}
          </div>
          <div className="truncate text-sm text-text-secondary">{user.email}</div>
        </div>

        <ArrowRight
          className="mt-0.5 h-4 w-4 flex-shrink-0 self-start text-text-secondary"
          aria-hidden="true"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(260px,0.9fr)]">
        <MetricCard
          label={localize('com_ui_role')}
          value={<div className="text-lg font-semibold text-text-primary">{user.role ?? '-'}</div>}
          emphasis={true}
        />
        <MetricCard
          label={localize('com_ui_admin_plan')}
          value={
            planSlug ? (
              <div className="space-y-1">
                <div className="text-lg font-semibold text-text-primary">{planLabel}</div>
                <div className="text-xs text-text-secondary">{planSlug}</div>
              </div>
            ) : (
              <div className="text-lg font-semibold text-text-primary">{planLabel}</div>
            )
          }
          emphasis={true}
        />
        <MetricCard
          label={localize('com_nav_balance')}
          value={<div className="text-lg font-semibold text-text-primary">{balanceLabel}</div>}
          emphasis={true}
        />
        <MetricCard
          label={localize('com_ui_admin_user_metadata_title')}
          value={
            <div className="grid gap-1 text-xs text-text-secondary">
              <div>
                {localize('com_ui_admin_email_verified')}:{' '}
                <span className="text-text-primary">
                  {user.emailVerified ? localize('com_ui_yes') : localize('com_ui_no')}
                </span>
              </div>
              <div>
                {localize('com_ui_admin_two_factor')}:{' '}
                <span className="text-text-primary">
                  {user.twoFactorEnabled ? localize('com_ui_yes') : localize('com_ui_no')}
                </span>
              </div>
              <div>
                {localize('com_ui_admin_updated_at')}:{' '}
                <span className="text-text-primary">{formatAdminDateTime(user.updatedAt)}</span>
              </div>
            </div>
          }
          emphasis={true}
        />
      </div>
    </button>
  );
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [emailVerified, setEmailVerified] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search);
  const rolesQuery = useGetAdminRolesQuery();
  const roleOptions = ['all', ...(rolesQuery.data?.roles.map((item) => item.name) ?? [])];

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [deferredSearch, role, emailVerified]);

  const usersQuery = useGetAdminUsersQuery({
    cursor,
    search: deferredSearch || undefined,
    role: role === 'all' ? undefined : role,
    emailVerified: emailVerified === '' ? undefined : emailVerified === 'true',
  });

  const users = usersQuery.data?.users ?? [];
  const currentPage = cursorHistory.length + 1;

  return (
    <AdminLayout
      title={localize('com_ui_admin_users')}
      description={null}
      eyebrow={null}
      hideHeader={true}
    >
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="text-lg font-medium text-text-primary">
                {localize('com_ui_admin_users')}
              </div>
              <button
                type="button"
                className="admin-button-secondary inline-flex h-8 w-8 items-center justify-center rounded-full"
                aria-label={localize('com_ui_more_info')}
                onClick={() => setShowOverview(true)}
              >
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-background px-3 py-1.5 text-xs font-medium text-text-secondary">
                {localize('com_ui_results_found', { count: users.length })}
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="admin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_admin_create_user')}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.8fr)_repeat(2,minmax(0,1fr))]">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_search')}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={localize('com_ui_admin_search_users_placeholder')}
                  className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                />
              </div>
            </label>

            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_role')}
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? localize('com_ui_all_proper') : option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_email_verified')}
              <select
                value={emailVerified}
                onChange={(event) => setEmailVerified(event.target.value)}
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{localize('com_ui_all_proper')}</option>
                <option value="true">{localize('com_ui_yes')}</option>
                <option value="false">{localize('com_ui_no')}</option>
              </select>
            </label>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {usersQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_empty_users')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {users.map((user) => (
                  <AdminUserListRow key={user.id} user={user} />
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_page')} {currentPage}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cursorHistory.length === 0}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  const nextHistory = [...cursorHistory];
                  const previousCursor = nextHistory.pop();
                  setCursorHistory(nextHistory);
                  setCursor(previousCursor || undefined);
                }}
              >
                {localize('com_ui_back')}
              </button>
              <button
                type="button"
                disabled={!usersQuery.data?.nextCursor}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  if (!usersQuery.data?.nextCursor) {
                    return;
                  }

                  setCursorHistory((current) => [...current, cursor ?? '']);
                  setCursor(usersQuery.data.nextCursor);
                }}
              >
                {localize('com_ui_admin_next_page')}
              </button>
            </div>
          </div>
        </section>

        <OGDialog open={showOverview} onOpenChange={setShowOverview}>
          <OGDialogPortal>
            <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
            <OGDialogContent
              className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
              showCloseButton={true}
            >
              <OGDialogTitle className="text-lg font-semibold text-text-primary">
                {localize('com_ui_admin_users_intro_title')}
              </OGDialogTitle>
              <div className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
                <p>{localize('com_ui_admin_users_intro_description')}</p>
                <p>
                  <span className="font-medium text-text-primary">
                    {localize('com_ui_admin_users_filters_title')}:
                  </span>{' '}
                  {localize('com_ui_admin_users_filters_description')}
                </p>
                <p>
                  <span className="font-medium text-text-primary">
                    {localize('com_ui_actions')}:
                  </span>{' '}
                  {localize('com_ui_admin_users_actions_description')}
                </p>
              </div>
            </OGDialogContent>
          </OGDialogPortal>
        </OGDialog>

        <OGDialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <OGDialogPortal>
            <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
            <OGDialogContent
              className="admin-console fixed left-1/2 top-1/2 z-50 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border-medium bg-surface-primary p-6 shadow-2xl focus:outline-none"
              showCloseButton={true}
            >
              <OGDialogTitle className="sr-only">
                {localize('com_ui_admin_create_user')}
              </OGDialogTitle>
              <AdminCreateUserCard
                onCreated={(userId) => {
                  setShowCreateModal(false);
                  navigate(`/d/admin/users/${userId}`);
                }}
                onCancel={() => setShowCreateModal(false)}
              />
            </OGDialogContent>
          </OGDialogPortal>
        </OGDialog>

        <Outlet />
      </div>
    </AdminLayout>
  );
}
