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
    <div className="rounded-2xl border border-border-medium bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  return formatAdminDateTime(value);
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
      <div className="rounded-2xl border border-border-medium bg-background p-4 text-sm text-text-secondary">
        {localize('com_ui_loading')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_transactions')}
          value={formatNumber(summary?.transactionCount)}
        />
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_users')}
          value={formatNumber(summary?.uniqueUsers)}
        />
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_token_value')}
          value={formatNumber(summary?.totalTokenValue)}
        />
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_raw_amount')}
          value={formatNumber(summary?.totalRawAmount)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_input_tokens')}
          value={formatNumber(summary?.totalInputTokens)}
        />
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_write_tokens')}
          value={formatNumber(summary?.totalWriteTokens)}
        />
        <SummaryCard
          title={localize('com_ui_admin_usage_summary_read_tokens')}
          value={formatNumber(summary?.totalReadTokens)}
        />
        <SummaryCard
          title={localize('com_ui_admin_oldest_transaction')}
          value={formatDate(summary?.oldestTransactionAt)}
        />
        <SummaryCard
          title={localize('com_ui_admin_newest_transaction')}
          value={formatDate(summary?.newestTransactionAt)}
        />
      </div>
    </div>
  );
}
