import { Link, useParams } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';
import { useGetAdminUserQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';
import AdminUserBalanceCard from './AdminUserBalanceCard';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border-medium bg-surface-primary p-4">
      <span className="text-xs uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
    </div>
  );
}

export default function AdminUserDetail() {
  const localize = useLocalize();
  const { userId = '' } = useParams();
  const { data: startupConfig } = useGetStartupConfig();
  const userQuery = useGetAdminUserQuery(userId, { enabled: userId.length > 0 });

  if (userQuery.isLoading) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_user_details')}
        description={localize('com_ui_admin_user_details_description')}
      >
        <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
      </AdminLayout>
    );
  }

  if (!userQuery.data) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_user_details')}
        description={localize('com_ui_admin_user_details_description')}
      >
        <div className="space-y-4">
          <Link className="text-sm text-text-secondary underline" to="/d/admin/users">
            {localize('com_ui_back')}
          </Link>
          <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
        </div>
      </AdminLayout>
    );
  }

  const user = userQuery.data;

  return (
    <AdminLayout
      title={localize('com_ui_admin_user_details')}
      description={localize('com_ui_admin_user_details_description')}
    >
      <div className="flex h-full flex-col gap-6">
        <div>
          <Link className="text-sm text-text-secondary underline" to="/d/admin/users">
            {localize('com_ui_back')}
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailRow
            label={localize('com_ui_user')}
            value={user.name || user.username || localize('com_ui_unknown')}
          />
          <DetailRow label={localize('com_ui_email')} value={user.email} />
          <DetailRow
            label={localize('com_ui_role')}
            value={user.role ?? localize('com_ui_unknown')}
          />
          <DetailRow label={localize('com_ui_provider')} value={user.provider} />
          <DetailRow
            label={localize('com_ui_admin_email_verified')}
            value={user.emailVerified ? localize('com_ui_yes') : localize('com_ui_no')}
          />
          <DetailRow
            label={localize('com_ui_admin_two_factor')}
            value={user.twoFactorEnabled ? localize('com_ui_yes') : localize('com_ui_no')}
          />
          <DetailRow
            label={localize('com_ui_admin_terms_accepted')}
            value={user.termsAccepted ? localize('com_ui_yes') : localize('com_ui_no')}
          />
          <DetailRow
            label={localize('com_ui_admin_favorites')}
            value={String(user.favoritesCount)}
          />
          <DetailRow
            label={localize('com_ui_admin_memories_enabled')}
            value={user.personalization.memories ? localize('com_ui_yes') : localize('com_ui_no')}
          />
        </div>

        {startupConfig?.balance?.enabled && (
          <AdminUserBalanceCard userId={user.id} tokenCredits={user.balance.tokenCredits} />
        )}
        {startupConfig?.balance?.enabled !== true && (
          <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
            <h2 className="text-sm font-medium text-text-primary">{localize('com_nav_balance')}</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {localize('com_ui_admin_balance_disabled')}
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-border-medium bg-surface-primary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">
            {localize('com_ui_admin_timestamps')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <DetailRow label={localize('com_ui_admin_created_at')} value={user.createdAt ?? '-'} />
            <DetailRow label={localize('com_ui_admin_updated_at')} value={user.updatedAt ?? '-'} />
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
