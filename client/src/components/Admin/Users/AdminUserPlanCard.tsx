import { useMemo, useState } from 'react';
import {
  useAssignAdminUserPlanMutation,
  useClearAdminUserPlanMutation,
  useGetAdminPlansQuery,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

function getErrorMessage(error: unknown): string | null {
  if (
    error != null &&
    typeof error === 'object' &&
    'response' in error &&
    error.response != null &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data != null &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return null;
}

type AdminUserPlanCardProps = {
  userId: string;
  currentPlan: {
    id: string;
    name: string;
    slug: string;
  } | null;
  assignedAt: string | null;
};

export default function AdminUserPlanCard({
  userId,
  currentPlan,
  assignedAt,
}: AdminUserPlanCardProps) {
  const localize = useLocalize();
  const plansQuery = useGetAdminPlansQuery();
  const assignMutation = useAssignAdminUserPlanMutation();
  const clearMutation = useClearAdminUserPlanMutation();
  const plans = plansQuery.data?.plans ?? [];
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlan?.id ?? '');
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );
  const currentPlanLabel = currentPlan
    ? `${currentPlan.name} (${currentPlan.slug})`
    : localize('com_ui_none');
  const nextPlanLabel = selectedPlan ? `${selectedPlan.name} (${selectedPlan.slug})` : null;
  const currentDisplayValue =
    nextPlanLabel != null && selectedPlanId !== currentPlan?.id
      ? `${currentPlanLabel} > ${nextPlanLabel}`
      : currentPlanLabel;

  const errorMessage =
    getErrorMessage(assignMutation.error) ?? getErrorMessage(clearMutation.error);

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_plan_assignment_title')}
        </h2>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-medium bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            {localize('com_ui_admin_current_plan')}
          </div>
          <div className="mt-2 text-sm text-text-primary">{currentDisplayValue}</div>
          <div className="mt-2 text-xs text-text-secondary">
            {assignedAt
              ? formatAdminDateTime(assignedAt)
              : localize('com_ui_admin_plan_unassigned')}
          </div>
        </div>

        <div className="rounded-2xl border border-border-medium bg-background p-4">
          {plansQuery.isLoading ? (
            <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
          ) : plans.length === 0 ? (
            <div className="text-sm text-text-secondary">
              {localize('com_ui_admin_no_plans_available')}
            </div>
          ) : (
            <div className="grid gap-3">
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{localize('com_ui_select')}</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.slug})
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    selectedPlanId.length === 0 ||
                    assignMutation.isLoading ||
                    clearMutation.isLoading
                  }
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    assignMutation.mutate({
                      userId,
                      planId: selectedPlanId,
                    });
                  }}
                >
                  {localize('com_ui_admin_assign_plan')}
                </button>
                <button
                  type="button"
                  disabled={
                    currentPlan == null || assignMutation.isLoading || clearMutation.isLoading
                  }
                  className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => clearMutation.mutate(userId)}
                >
                  {localize('com_ui_admin_clear_plan')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
