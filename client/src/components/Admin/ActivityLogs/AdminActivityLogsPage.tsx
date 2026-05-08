import { useEffect, useState } from 'react';
import { ClipboardList, Filter, Search } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import type {
  AdminActivityLog,
  AdminActivityLogResult,
  AdminActivityLogsListParams,
} from 'librechat-data-provider';
import { useGetAdminActivityLogsQuery } from '~/data-provider/Admin';
import { useAuthContext, useLocalize } from '~/hooks';
import AdminDateTimePicker from '../AdminDateTimePicker';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

function ResultBadge({ result }: { result: AdminActivityLogResult }) {
  const localize = useLocalize();
  const isSuccess = result === 'success';

  return (
    <span
      className={
        isSuccess
          ? 'inline-flex rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-300'
          : 'inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300'
      }
    >
      {localize(
        isSuccess ? 'com_ui_admin_audit_result_success' : 'com_ui_admin_audit_result_failure',
      )}
    </span>
  );
}

function formatMetadata(event: AdminActivityLog): string {
  const entries = Object.entries(event.metadata);
  if (entries.length === 0) {
    return '-';
  }

  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

function ActivityLogRow({ event }: { event: AdminActivityLog }) {
  const localize = useLocalize();

  return (
    <div className="grid gap-4 rounded-2xl border border-border-medium bg-background p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ResultBadge result={event.result} />
            <span className="rounded-full border border-border-light bg-surface-primary px-3 py-1 text-xs font-medium text-text-secondary">
              {event.action}
            </span>
            <span className="rounded-full border border-border-light bg-surface-primary px-3 py-1 text-xs font-medium text-text-secondary">
              {event.resourceType}
            </span>
          </div>
          <div className="break-all text-sm text-text-primary">{event.eventId}</div>
          {event.message ? (
            <div className="text-sm text-text-secondary">{event.message}</div>
          ) : null}
        </div>
        <div className="text-sm text-text-secondary">{formatAdminDateTime(event.createdAt)}</div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_audit_actor')}
          </div>
          <div className="mt-1 break-all text-text-primary">
            {event.actorUserId ?? localize('com_ui_none')}
          </div>
          <div className="mt-1 text-xs text-text-secondary">{event.actorRole ?? '-'}</div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_audit_resource')}
          </div>
          <div className="mt-1 break-all text-text-primary">
            {event.resourceId ?? localize('com_ui_none')}
          </div>
          <div className="mt-1 text-xs text-text-secondary">{event.resourceType}</div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_department')}
          </div>
          <div className="mt-1 break-all text-text-primary">
            {event.actorDepartmentId ?? localize('com_ui_none')}
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_audit_metadata')}
          </div>
          <div className="mt-1 break-words text-text-primary">{formatMetadata(event)}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdminActivityLogsPage() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [actorUserId, setActorUserId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [action, setAction] = useState('');
  const [result, setResult] = useState<'all' | AdminActivityLogResult>('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const canViewAudit =
    user?.role === SystemRoles.ADMIN || user?.role === SystemRoles.AUDITOR;

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [actorUserId, resourceType, resourceId, action, result, createdAfter, createdBefore]);

  const filters: AdminActivityLogsListParams = {
    actorUserId: actorUserId.trim() || undefined,
    resourceType: resourceType.trim() || undefined,
    resourceId: resourceId.trim() || undefined,
    action: action.trim() || undefined,
    result: result === 'all' ? undefined : result,
    createdAfter: createdAfter || undefined,
    createdBefore: createdBefore || undefined,
  };
  const activityLogsQuery = useGetAdminActivityLogsQuery(
    {
      ...filters,
      cursor,
      limit: 20,
    },
    {
      enabled: canViewAudit,
    },
  );
  const events = activityLogsQuery.data?.events ?? [];
  const currentPage = cursorHistory.length + 1;
  const errorMessage = getErrorMessage(activityLogsQuery.error);

  if (!canViewAudit) {
    return <Navigate to="/d/admin/conversations" replace={true} />;
  }

  return (
    <AdminLayout title={localize('com_ui_admin_audit_events')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_audit_events')}
                </h1>
                <AdminHelpButton
                  title="com_ui_admin_audit_events"
                  description="com_ui_admin_audit_events_description"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_audit_actor_user_id')}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="search"
                    value={actorUserId}
                    onChange={(event) => setActorUserId(event.target.value)}
                    className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_audit_resource_type')}
                <input
                  type="text"
                  value={resourceType}
                  onChange={(event) => setResourceType(event.target.value)}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_audit_resource_id')}
                <input
                  type="text"
                  value={resourceId}
                  onChange={(event) => setResourceId(event.target.value)}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_audit_action')}
                <input
                  type="text"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_audit_result')}
                <select
                  value={result}
                  onChange={(event) => setResult(event.target.value as 'all' | AdminActivityLogResult)}
                  className="w-full rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                >
                  <option value="all">{localize('com_ui_all')}</option>
                  <option value="success">{localize('com_ui_admin_audit_result_success')}</option>
                  <option value="failure">{localize('com_ui_admin_audit_result_failure')}</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_created_after')}
                <AdminDateTimePicker
                  mode="datetime"
                  value={createdAfter}
                  onChange={setCreatedAfter}
                  ariaLabel={localize('com_ui_admin_created_after')}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                {localize('com_ui_admin_created_before')}
                <AdminDateTimePicker
                  mode="datetime"
                  value={createdBefore}
                  onChange={setCreatedBefore}
                  ariaLabel={localize('com_ui_admin_created_before')}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="admin-button-secondary inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                  onClick={() => {
                    setActorUserId('');
                    setResourceType('');
                    setResourceId('');
                    setAction('');
                    setResult('all');
                    setCreatedAfter('');
                    setCreatedBefore('');
                  }}
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  {localize('com_ui_clear')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="shrink-0 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_audit_events')}
              </h2>
              <div className="text-sm text-text-secondary">{events.length}</div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
            {activityLogsQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : errorMessage ? (
              <div className="rounded-2xl border border-dashed border-red-500/30 bg-background p-6 text-sm text-red-600 dark:text-red-300">
                {errorMessage}
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_empty_audit_events')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {events.map((event) => (
                  <ActivityLogRow key={event.id} event={event} />
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
                disabled={!activityLogsQuery.data?.nextCursor}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  if (!activityLogsQuery.data?.nextCursor) {
                    return;
                  }

                  setCursorHistory((current) => [...current, cursor ?? '']);
                  setCursor(activityLogsQuery.data.nextCursor);
                }}
              >
                {localize('com_ui_admin_next_page')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
