import type { AdminUsageSummaryResponse } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

type SummaryCardProps = {
  title: string;
  value: string;
};

type AdminUsageSummaryCardsProps = {
  isLoading: boolean;
  summary: AdminUsageSummaryResponse | undefined;
  errorMessage?: string;
};

function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border-medium bg-background px-3 py-2">
      <div className="truncate text-xs text-text-secondary">{title}</div>
      <div className="mt-1 truncate text-base font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  return formatAdminDateTime(value);
}

function formatTotalTokens(summary: AdminUsageSummaryResponse | undefined) {
  return formatNumber(
    (summary?.totalInputTokens ?? 0) +
      (summary?.totalWriteTokens ?? 0) +
      (summary?.totalReadTokens ?? 0),
  );
}

export default function AdminUsageSummaryCards({
  isLoading,
  summary,
  errorMessage,
}: AdminUsageSummaryCardsProps) {
  const localize = useLocalize();

  if (errorMessage) {
    return (
      <div className="border-danger text-danger rounded-2xl border bg-red-500/10 p-4 text-sm">
        {errorMessage}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      <SummaryCard
        title={localize('com_ui_admin_usage_summary_transactions')}
        value={formatNumber(summary?.transactionCount)}
      />
      <SummaryCard
        title={localize('com_ui_admin_usage_summary_users')}
        value={formatNumber(summary?.uniqueUsers)}
      />
      <SummaryCard title={localize('com_ui_tokens')} value={formatTotalTokens(summary)} />
      <SummaryCard
        title={localize('com_ui_admin_usage_summary_token_value')}
        value={formatNumber(summary?.totalTokenValue)}
      />
      <SummaryCard
        title={localize('com_ui_admin_usage_summary_raw_amount')}
        value={formatNumber(summary?.totalRawAmount)}
      />
      <SummaryCard
        title={localize('com_ui_admin_newest_transaction')}
        value={formatDate(summary?.newestTransactionAt)}
      />
    </div>
  );
}
