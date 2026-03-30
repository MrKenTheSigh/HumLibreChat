import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { AdminTransactionsListParams } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useGetAdminTransactionsQuery, useGetAdminUsageSummaryQuery } from '~/data-provider/Admin';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import AdminTransactionsTable from './AdminTransactionsTable';
import AdminUsageFilters from './AdminUsageFilters';
import AdminUsageSummaryCards from './AdminUsageSummaryCards';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return undefined;
}

export default function AdminUsagePage() {
  const localize = useLocalize();
  const [userId, setUserId] = useState('');
  const [model, setModel] = useState('');
  const [context, setContext] = useState('');
  const [tokenType, setTokenType] = useState<'all' | 'prompt' | 'completion' | 'credits'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [userId, model, context, tokenType, dateFrom, dateTo]);

  const filters: AdminTransactionsListParams = {
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
  const transactions = transactionsQuery.data?.transactions ?? [];
  const currentPage = cursorHistory.length + 1;

  return (
    <AdminLayout title={localize('com_ui_admin_usage')} hideHeader={true}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5">
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
              userId={userId}
              model={model}
              context={context}
              tokenType={tokenType}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onUserIdChange={setUserId}
              onModelChange={setModel}
              onContextChange={setContext}
              onTokenTypeChange={setTokenType}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          </div>
        </section>

        <section className="shrink-0 rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-text-primary">
              {localize('com_ui_admin_usage')}
            </h2>
          </div>
          <AdminUsageSummaryCards
            isLoading={summaryQuery.isLoading}
            summary={summaryQuery.data}
            errorMessage={getErrorMessage(summaryQuery.error)}
          />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="shrink-0 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_usage_transactions_title')}
              </h2>
              <div className="text-sm text-text-secondary">{transactions.length}</div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
            <div className="rounded-2xl border border-border-medium bg-background">
              <AdminTransactionsTable
                isLoading={transactionsQuery.isLoading}
                transactions={transactions}
                errorMessage={getErrorMessage(transactionsQuery.error)}
              />
            </div>
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
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
