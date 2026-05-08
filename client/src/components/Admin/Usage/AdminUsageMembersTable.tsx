import type { AdminUsageMemberItem } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

type AdminUsageMembersTableProps = {
  isLoading: boolean;
  members: AdminUsageMemberItem[];
  errorMessage?: string;
};

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

export default function AdminUsageMembersTable({
  isLoading,
  members,
  errorMessage,
}: AdminUsageMembersTableProps) {
  const localize = useLocalize();

  if (errorMessage) {
    return <div className="text-danger p-6 text-sm">{errorMessage}</div>;
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>;
  }

  if (members.length === 0) {
    return (
      <div className="p-6 text-sm text-text-secondary">
        {localize('com_ui_admin_empty_usage_members')}
      </div>
    );
  }

  return (
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-border-medium text-text-secondary">
        <tr>
          <th className="px-4 py-3 font-medium">{localize('com_ui_user')}</th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_transactions')}
          </th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_tokens')}</th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_token_value')}
          </th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_raw_amount')}
          </th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_input_tokens')}
          </th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_write_tokens')}
          </th>
          <th className="px-4 py-3 font-medium">
            {localize('com_ui_admin_usage_summary_read_tokens')}
          </th>
          <th className="px-4 py-3 font-medium">{localize('com_ui_last_used')}</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member) => (
          <tr key={member.userId} className="border-b border-border-light align-top">
            <td className="px-4 py-3">
              <div className="font-medium text-text-primary">
                {member.userName || member.userEmail || member.userId}
              </div>
              <div className="text-xs text-text-secondary">
                {member.userEmail ?? member.userId}
              </div>
            </td>
            <td className="px-4 py-3 text-text-primary">
              {formatNumber(member.transactionCount)}
            </td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(member.totalTokens)}</td>
            <td className="px-4 py-3 text-text-primary">
              {formatNumber(member.totalTokenValue)}
            </td>
            <td className="px-4 py-3 text-text-primary">{formatNumber(member.totalRawAmount)}</td>
            <td className="px-4 py-3 text-text-primary">
              {formatNumber(member.totalInputTokens)}
            </td>
            <td className="px-4 py-3 text-text-primary">
              {formatNumber(member.totalWriteTokens)}
            </td>
            <td className="px-4 py-3 text-text-primary">
              {formatNumber(member.totalReadTokens)}
            </td>
            <td className="px-4 py-3 text-text-primary">
              {formatAdminDateTime(member.newestTransactionAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
