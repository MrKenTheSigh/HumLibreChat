import { useNavigate } from 'react-router-dom';
import { useGetAdminPlansQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? 'inline-flex rounded-full bg-surface-hover px-2 py-1 text-xs font-medium text-text-primary'
          : 'inline-flex rounded-full bg-background px-2 py-1 text-xs font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  );
}

export default function AdminPlansPage() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const plansQuery = useGetAdminPlansQuery();
  const plans = plansQuery.data?.plans ?? [];

  return (
    <AdminLayout
      title={localize('com_ui_admin_plans')}
      description={localize('com_ui_admin_plans_description')}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-xl bg-surface-hover px-4 py-2 text-sm font-medium text-text-primary"
            onClick={() => navigate('/d/admin/plans/new')}
          >
            {localize('com_ui_create')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border-medium bg-surface-primary">
          {plansQuery.isLoading ? (
            <div className="p-6 text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : plans.length === 0 ? (
            <div className="p-6 text-sm text-text-secondary">
              {localize('com_ui_admin_empty_plans')}
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border-medium text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_name')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_plan_status')}</th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_sort_order')}</th>
                  <th className="px-4 py-3 font-medium">
                    {localize('com_ui_admin_entitlement_count')}
                  </th>
                  <th className="px-4 py-3 font-medium">{localize('com_ui_admin_updated_at')}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    className="cursor-pointer border-b border-border-light transition-colors hover:bg-surface-hover"
                    onClick={() => navigate(`/d/admin/plans/${plan.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{plan.name}</div>
                      <div className="text-xs text-text-secondary">{plan.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge
                          active={plan.enabled}
                          label={
                            plan.enabled
                              ? localize('com_ui_admin_enabled')
                              : localize('com_ui_admin_disabled')
                          }
                        />
                        {plan.isDefault && (
                          <StatusBadge
                            active={true}
                            label={localize('com_ui_admin_default_plan')}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-primary">{plan.sortOrder}</td>
                    <td className="px-4 py-3 text-text-primary">
                      {plan.modelEntitlements.length > 0
                        ? plan.modelEntitlements.length
                        : plan.channelIds.length}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{plan.updatedAt ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
