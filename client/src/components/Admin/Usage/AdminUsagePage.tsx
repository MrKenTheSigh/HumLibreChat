import { useEffect, useState } from 'react';
import { useLocalize } from '~/hooks';
import {
  useGetAdminTransactionsQuery,
  useGetAdminUsageSummaryQuery,
} from '~/data-provider/Admin';
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
  const [tokenType, setTokenType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [userId, model, context, tokenType, dateFrom, dateTo]);

  const filters = {
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

  return (
    <AdminLayout
      title={localize('com_ui_admin_usage')}
      description={localize('com_ui_admin_usage_description')}
    >
      <div className="flex h-full flex-col gap-4">
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

        <AdminUsageSummaryCards
          isLoading={summaryQuery.isLoading}
          summary={summaryQuery.data}
          errorMessage={getErrorMessage(summaryQuery.error)}
        />

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary">
          <AdminTransactionsTable
            isLoading={transactionsQuery.isLoading}
            transactions={transactions}
            errorMessage={getErrorMessage(transactionsQuery.error)}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={cursorHistory.length === 0}
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
            className="rounded-xl border border-border-medium px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
    </AdminLayout>
  );
}
