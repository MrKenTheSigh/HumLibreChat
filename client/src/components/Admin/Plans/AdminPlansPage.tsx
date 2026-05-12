import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Layers3, Search, Sparkles } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';
import { useGetAdminPlansQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';
import formatAdminDateTime from '../formatAdminDateTime';

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={
        active
          ? 'inline-flex rounded-full border border-border-medium bg-background px-3 py-1 text-xs font-medium text-text-primary'
          : 'inline-flex rounded-full border border-border-light bg-surface-hover px-3 py-1 text-xs font-medium text-text-secondary'
      }
    >
      {label}
    </span>
  );
}

export default function AdminPlansPage() {
  const pageSize = 20;
  const navigate = useNavigate();
  const localize = useLocalize();
  const startupConfig = useGetStartupConfig();
  const plansQuery = useGetAdminPlansQuery();
  const legacyBalanceEnabled = startupConfig.data?.legacyBalanceEnabled === true;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const plans = plansQuery.data?.plans ?? [];
  const filteredPlans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return plans;
    }

    return plans.filter((plan) =>
      `${plan.name} ${plan.slug} ${plan.description ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [plans, search]);
  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / pageSize));
  const pagedPlans = filteredPlans.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <AdminLayout title={localize('com_ui_admin_plans')} hideHeader={true}>
      <div className="flex h-full flex-col gap-6">
        <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <Layers3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_plans')}
                </h1>
                <AdminHelpButton
                  title="com_ui_admin_plans"
                  description="com_ui_admin_plans_description"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-light bg-background px-3 py-1.5 text-xs font-medium text-text-secondary">
                {localize('com_ui_results_found', { count: filteredPlans.length })}
              </div>
              <button
                type="button"
                className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium"
                onClick={() => navigate('/d/admin/plans/new')}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {localize('com_ui_create')}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_search')}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={localize('com_ui_search')}
                  className="w-full rounded-xl border border-border-medium bg-background py-2 pl-9 pr-3 text-sm text-text-primary"
                />
              </div>
            </label>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary">
          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_plans')}
              </h2>
              <div className="text-sm text-text-secondary">{filteredPlans.length}</div>
            </div>

            {plansQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_admin_empty_plans')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pagedPlans.map((plan) => {
                  const entitlementCount =
                    plan.modelEntitlements.length > 0
                      ? plan.modelEntitlements.length
                      : plan.channelIds.length;

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      className="grid gap-4 rounded-2xl border border-border-medium bg-background p-4 text-left transition-colors hover:bg-surface-hover"
                      onClick={() => navigate(`/d/admin/plans/${plan.id}`)}
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div>
                            <div className="text-base font-medium text-text-primary">
                              {plan.name}
                            </div>
                            <div className="text-sm text-text-secondary">{plan.slug}</div>
                          </div>
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
                            <StatusBadge
                              active={entitlementCount > 0}
                              label={`${localize('com_ui_admin_plan_model_entitlements')}: ${entitlementCount}`}
                            />
                          </div>
                        </div>
                        <ArrowRight
                          className="h-4 w-4 self-start text-text-secondary"
                          aria-hidden="true"
                        />
                      </div>

                      <div
                        className={`grid gap-3 text-sm ${
                          legacyBalanceEnabled ? 'md:grid-cols-3' : 'md:grid-cols-2'
                        }`}
                      >
                        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                          <div className="text-xs uppercase tracking-wide text-text-secondary">
                            {localize('com_ui_admin_sort_order')}
                          </div>
                          <div className="mt-1 text-text-primary">{plan.sortOrder}</div>
                        </div>
                        {legacyBalanceEnabled && (
                          <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                            <div className="text-xs uppercase tracking-wide text-text-secondary">
                              {localize('com_ui_admin_starting_credits')}
                            </div>
                            <div className="mt-1 text-text-primary">
                              {plan.startingCredits == null
                                ? localize('com_ui_none')
                                : plan.startingCredits.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <div className="rounded-xl border border-border-light bg-surface-primary px-3 py-2">
                          <div className="text-xs uppercase tracking-wide text-text-secondary">
                            {localize('com_ui_admin_updated_at')}
                          </div>
                          <div className="mt-1 text-text-primary">
                            {formatAdminDateTime(plan.updatedAt)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light px-5 py-4">
            <div className="text-sm text-text-secondary">
              {localize('com_ui_page')} {page}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {localize('com_ui_back')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                {localize('com_ui_admin_next_page')}
              </button>
            </div>
          </div>
        </section>
      </div>
      <Outlet />
    </AdminLayout>
  );
}
