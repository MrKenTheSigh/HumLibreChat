import type { AdminTransactionItem } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

type AdminTransactionsTableProps = {
  isLoading: boolean;
  transactions: AdminTransactionItem[];
  errorMessage?: string;
};

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

function formatRateDetail(rateDetail: Record<string, number> | null | undefined) {
  if (!rateDetail || Object.keys(rateDetail).length === 0) {
    return '-';
  }

  return Object.entries(rateDetail)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ');
}

export default function AdminTransactionsTable({
  isLoading,
  transactions,
  errorMessage,
}: AdminTransactionsTableProps) {
  const localize = useLocalize();

  if (errorMessage) {
    return <div className="text-danger p-6 text-sm">{errorMessage}</div>;
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="p-6 text-sm text-text-secondary">
        {localize('com_ui_admin_empty_transactions')}
      </div>
    );
  }

  return (
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-border-medium text-text-secondary">
        <tr>
          <th className="px-4 py-3 font-medium">{localize('com_ui_admin_created_at')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_user')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_model')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_context')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_admin_token_type')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_value')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_admin_raw_amount')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_admin_rate')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_admin_rate_detail')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_input')}</th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_write')}</th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_read_tokens')}
          </th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_conversation')}</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => (
          <tr key={transaction.id} className="border-b border-border-light align-top">
            <td className="px-4 py-3 text-text-primary">
              {formatAdminDateTime(transaction.createdAt)}
            </td>
            <td className="px-4 py-3">
              <div className="font-medium text-text-primary">
                {transaction.userName || transaction.userEmail || transaction.userId}
              </div>
              <div className="text-xs text-text-secondary">
                {transaction.userEmail ?? transaction.userId}
              </div>
            </td>
            <td className="px-4 py-3 text-text-primary">{transaction.model ?? '-'}</td>
            <td className="px-4 py-3 text-text-primary">{transaction.context ?? '-'}</td>
            <td className="px-4 py-3">
              <span className="inline-flex rounded-full border border-border-light bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-primary">
                {transaction.tokenType}
              </span>
            </td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.tokenValue)}</td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.rawAmount)}</td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.rate)}</td>
            <td className="px-4 py-3 text-text-primary">
              {formatRateDetail(transaction.rateDetail)}
            </td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.inputTokens)}</td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.writeTokens)}</td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(transaction.readTokens)}</td>
            <td className="px-4 py-3 text-text-primary">{transaction.conversationId ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
