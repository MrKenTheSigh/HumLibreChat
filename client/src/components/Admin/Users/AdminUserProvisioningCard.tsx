import type { AdminUserDetail, AdminUserProvisioningState } from 'librechat-data-provider';
import { useApplyAdminUserStartingCreditsMutation } from '~/data-provider/Admin';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useLocalize } from '~/hooks';
import formatAdminDateTime from '../formatAdminDateTime';

type CurrentPlan = AdminUserDetail['plan'];
type ProvisioningState = AdminUserProvisioningState;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-medium bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-sm text-text-primary">{value}</div>
    </div>
  );
}

function getStatusLabel(params: {
  currentPlan: CurrentPlan;
  localize: (key: TranslationKeys) => string;
  provisioning: ProvisioningState;
}): string {
  const { currentPlan, localize, provisioning } = params;

  if (provisioning.balanceEnabled !== true) {
    return localize('com_ui_admin_provisioning_balance_disabled');
  }

  if (currentPlan == null) {
    return localize('com_ui_admin_provisioning_no_plan');
  }

  if (provisioning.currentPlanStartingCredits == null) {
    return localize('com_ui_admin_provisioning_no_starting_credits');
  }

  if (provisioning.appliedPlanMatchesCurrent) {
    return localize('com_ui_admin_provisioning_applied_current_plan');
  }

  return localize('com_ui_admin_provisioning_ready');
}

function getSourceLabel(
  source: ProvisioningState['appliedSource'],
  localize: (key: TranslationKeys) => string,
): string {
  if (source === 'plan_assignment_auto_seed') {
    return localize('com_ui_admin_provisioning_source_auto');
  }

  if (source === 'admin_manual_apply') {
    return localize('com_ui_admin_provisioning_source_manual');
  }

  return '-';
}

export default function AdminUserProvisioningCard({
  currentPlan,
  provisioning,
  userId,
}: {
  currentPlan: CurrentPlan;
  provisioning: ProvisioningState;
  userId: string;
}) {
  const localize = useLocalize();
  const applyMutation = useApplyAdminUserStartingCreditsMutation();

  const errorMessage =
    applyMutation.error?.response?.data?.message ?? applyMutation.error?.message ?? null;

  return (
    <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
      <div className="mb-4">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_plan_provisioning')}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DetailRow
          label={localize('com_ui_admin_starting_credits')}
          value={
            provisioning.currentPlanStartingCredits == null
              ? localize('com_ui_none')
              : new Intl.NumberFormat().format(provisioning.currentPlanStartingCredits)
          }
        />
        <DetailRow
          label={localize('com_ui_admin_balance_record')}
          value={provisioning.hasBalanceRecord ? localize('com_ui_yes') : localize('com_ui_no')}
        />
        <DetailRow
          label={localize('com_ui_admin_provisioning_status')}
          value={getStatusLabel({ currentPlan, localize, provisioning })}
        />
        <DetailRow
          label={localize('com_ui_admin_provisioning_last_applied')}
          value={formatAdminDateTime(provisioning.appliedAt)}
        />
        <DetailRow
          label={localize('com_ui_admin_provisioning_last_source')}
          value={getSourceLabel(provisioning.appliedSource, localize)}
        />
        <DetailRow
          label={localize('com_ui_admin_applied_amount')}
          value={
            provisioning.appliedAmount == null
              ? '-'
              : new Intl.NumberFormat().format(provisioning.appliedAmount)
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={provisioning.canApplyStartingCredits !== true || applyMutation.isLoading}
          className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => applyMutation.mutate({ userId })}
        >
          {localize('com_ui_admin_apply_starting_credits')}
        </button>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
