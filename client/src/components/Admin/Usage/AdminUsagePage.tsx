import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, X } from 'lucide-react';
import { SystemRoles, dataService } from 'librechat-data-provider';
import type { AdminTransactionsListParams } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import {
  useGetAdminDepartmentsQuery,
  useGetAdminUsageMembersQuery,
  useGetAdminTransactionsQuery,
  useGetAdminUsageSummaryQuery,
} from '~/data-provider/Admin';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import AdminTransactionsTable from './AdminTransactionsTable';
import AdminUsageFilters from './AdminUsageFilters';
import AdminUsageMembersTable from './AdminUsageMembersTable';
import AdminUsageSummaryCards from './AdminUsageSummaryCards';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

type UsageView = 'transactions' | 'members';
type PendingExport = {
  count: number;
  filters: AdminTransactionsListParams;
  limit: number;
  view: UsageView;
};

function triggerCsvDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function AdminUsagePage() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const canSelectDepartment = user?.role === SystemRoles.ADMIN;
  const [departmentId, setDepartmentId] = useState('');
  const [userId, setUserId] = useState('');
  const [model, setModel] = useState('');
  const [context, setContext] = useState('');
  const [tokenType, setTokenType] = useState<'all' | 'prompt' | 'completion' | 'credits'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeView, setActiveView] = useState<UsageView>('transactions');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | undefined>(undefined);
  const [memberCursorHistory, setMemberCursorHistory] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>(undefined);
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
    setMemberCursor(undefined);
    setMemberCursorHistory([]);
  }, [departmentId, userId, model, context, tokenType, dateFrom, dateTo]);

  const departmentsQuery = useGetAdminDepartmentsQuery(
    {},
    {
      enabled: canSelectDepartment,
    },
  );

  const filters: AdminTransactionsListParams = {
    departmentId: departmentId.trim() || undefined,
    userId: userId.trim() || undefined,
    model: model.trim() || undefined,
    context: context.trim() || undefined,
    tokenType: tokenType === 'all' ? undefined : tokenType,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const transactionsQuery = useGetAdminTransactionsQuery({
    ...filters,
    cursor,
    limit: 20,
  });
  const summaryQuery = useGetAdminUsageSummaryQuery(filters);
  const membersQuery = useGetAdminUsageMembersQuery({
    ...filters,
    cursor: memberCursor,
    limit: 10,
  });
  const transactions = transactionsQuery.data?.transactions ?? [];
  const members = membersQuery.data?.members ?? [];
  const currentPage = cursorHistory.length + 1;
  const memberCurrentPage = memberCursorHistory.length + 1;
  const performExport = async (view: UsageView, exportFilters: AdminTransactionsListParams) => {
    const response =
      view === 'transactions'
        ? await dataService.exportAdminTransactionsCsv(exportFilters)
        : await dataService.exportAdminUsageMembersCsv(exportFilters);

    triggerCsvDownload(
      response.data,
      view === 'transactions' ? 'admin-usage-transactions.csv' : 'admin-usage-members.csv',
    );
  };
  const exportCsv = async () => {
    setIsExporting(true);
    setExportError(undefined);

    try {
      const exportCount =
        activeView === 'transactions'
          ? await dataService.getAdminTransactionsExportCount(filters)
          : await dataService.getAdminUsageMembersExportCount(filters);

      if (exportCount.count > exportCount.limit) {
        setPendingExport({
          count: exportCount.count,
          filters,
          limit: exportCount.limit,
          view: activeView,
        });
        return;
      }

      await performExport(activeView, filters);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : localize('com_ui_error'));
    } finally {
      setIsExporting(false);
    }
  };
  const confirmExport = async () => {
    if (!pendingExport) {
      return;
    }

    const exportRequest = pendingExport;
    setPendingExport(null);
    setIsExporting(true);
    setExportError(undefined);

    try {
      await performExport(exportRequest.view, exportRequest.filters);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : localize('com_ui_error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AdminLayout title={localize('com_ui_admin_usage')} hideHeader={true}>
      {pendingExport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-usage-export-confirm-title"
            className="w-full max-w-md rounded-2xl border border-border-medium bg-surface-primary p-5 text-text-primary shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="admin-usage-export-confirm-title" className="text-base font-medium">
                  {localize('com_ui_admin_export_limit_title')}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {localize('com_ui_admin_export_limit_confirm', {
                    0: pendingExport.limit.toLocaleString(),
                    1: pendingExport.count.toLocaleString(),
                  })}
                </p>
              </div>
              <button
                type="button"
                className="admin-button-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                aria-label={localize('com_ui_close')}
                onClick={() => setPendingExport(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm"
                onClick={() => setPendingExport(null)}
              >
                {localize('com_ui_cancel')}
              </button>
              <button
                type="button"
                className="admin-button-primary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isExporting}
                onClick={() => void confirmExport()}
              >
                {localize('com_ui_continue')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <section className="shrink-0 rounded-2xl border border-border-medium bg-surface-primary p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_usage')}
                </h1>
                <AdminHelpButton
                  title="com_ui_admin_usage"
                  description="com_ui_admin_usage_description"
                />
              </div>
            </div>
            <AdminUsageFilters
              departmentId={departmentId}
              canSelectDepartment={canSelectDepartment}
              departments={departmentsQuery.data?.departments ?? []}
              userId={userId}
              model={model}
              context={context}
              tokenType={tokenType}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDepartmentIdChange={setDepartmentId}
              onUserIdChange={setUserId}
              onModelChange={setModel}
              onContextChange={setContext}
              onTokenTypeChange={setTokenType}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          </div>
        </section>

        <section className="shrink-0 rounded-2xl border border-border-medium bg-surface-primary p-3">
          <AdminUsageSummaryCards
            isLoading={summaryQuery.isLoading}
            summary={summaryQuery.data}
            errorMessage={getErrorMessage(summaryQuery.error)}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-medium bg-surface-primary">
          <div className="shrink-0 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border border-border-medium bg-background p-1">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    activeView === 'transactions'
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setActiveView('transactions')}
                >
                  {localize('com_ui_admin_usage_transactions_title')}
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    activeView === 'members'
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setActiveView('members')}
                >
                  {localize('com_ui_admin_usage_members_title')}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-text-secondary">
                  {activeView === 'transactions' ? transactions.length : members.length}
                </div>
                <button
                  type="button"
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isExporting}
                  onClick={() => void exportCsv()}
                >
                  {isExporting
                    ? localize('com_ui_loading')
                    : localize('com_ui_admin_export_csv')}
                </button>
              </div>
            </div>
            {exportError ? (
              <div
                role="alert"
                className="mt-2 rounded-xl border border-danger bg-red-500/10 px-3 py-2 text-sm text-danger"
              >
                {exportError}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <div className="rounded-2xl border border-border-medium bg-background">
              {activeView === 'transactions' ? (
                <AdminTransactionsTable
                  isLoading={transactionsQuery.isLoading}
                  transactions={transactions}
                  errorMessage={getErrorMessage(transactionsQuery.error)}
                />
              ) : (
                <AdminUsageMembersTable
                  isLoading={membersQuery.isLoading}
                  members={members}
                  errorMessage={getErrorMessage(membersQuery.error)}
                />
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-4 py-3">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_page')}{' '}
              {activeView === 'transactions' ? currentPage : memberCurrentPage}
            </div>
            {activeView === 'transactions' ? (
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
                  disabled={!transactionsQuery.data?.nextCursor}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    if (!transactionsQuery.data?.nextCursor) {
                      return;
                    }

                    setCursorHistory((current) => [...current, cursor ?? '']);
                    setCursor(transactionsQuery.data.nextCursor);
                  }}
                >
                  {localize('com_ui_admin_next_page')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={memberCursorHistory.length === 0}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    const nextHistory = [...memberCursorHistory];
                    const previousCursor = nextHistory.pop();
                    setMemberCursorHistory(nextHistory);
                    setMemberCursor(previousCursor || undefined);
                  }}
                >
                  {localize('com_ui_back')}
                </button>
                <button
                  type="button"
                  disabled={!membersQuery.data?.nextCursor}
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    if (!membersQuery.data?.nextCursor) {
                      return;
                    }

                    setMemberCursorHistory((current) => [...current, memberCursor ?? '']);
                    setMemberCursor(membersQuery.data.nextCursor);
                  }}
                >
                  {localize('com_ui_admin_next_page')}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
