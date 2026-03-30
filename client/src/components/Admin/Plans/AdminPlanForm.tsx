import { useEffect, useState } from 'react';
import { Layers3 } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { AdminChannel, AdminPlanModelEntitlement, TError } from 'librechat-data-provider';
import {
  useCreateAdminPlanMutation,
  useDeleteAdminPlanMutation,
  useGetAdminChannelsQuery,
  useGetAdminPlanQuery,
  useUpdateAdminPlanMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';

type AvailablePlanModelEntitlement = AdminPlanModelEntitlement;

type PlanFormState = {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: string;
  modelEntitlements: AdminPlanModelEntitlement[];
  notes: string;
  startingCredits: string;
};

const emptyPlanState: PlanFormState = {
  name: '',
  slug: '',
  description: '',
  enabled: true,
  isDefault: false,
  sortOrder: '0',
  modelEntitlements: [],
  notes: '',
  startingCredits: '',
};

function toErrorMessage(error: TError | null | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

function createEntitlementKey(entitlement: AdminPlanModelEntitlement): string {
  return `${entitlement.channelId}::${entitlement.endpoint}::${entitlement.model}`;
}

function createAvailablePlanModelEntitlements(
  channels: AdminChannel[],
): AvailablePlanModelEntitlement[] {
  return channels.reduce<AvailablePlanModelEntitlement[]>((records, channel) => {
    if (channel.enabled !== true) {
      return records;
    }

    const endpoint = channel.connection.runtimeEndpoint.trim();
    if (endpoint.length === 0) {
      return records;
    }

    for (const model of channel.models) {
      if (model.enabled !== true) {
        continue;
      }

      records.push({
        channelId: channel.id,
        endpoint,
        model: model.model,
      });
    }

    return records;
  }, []);
}

function deriveLegacyModelEntitlements(
  channelIds: string[],
  channels: AdminChannel[],
): AdminPlanModelEntitlement[] {
  const selectedChannelIds = new Set(channelIds);
  return createAvailablePlanModelEntitlements(channels).reduce<AdminPlanModelEntitlement[]>(
    (records, entitlement) => {
      if (selectedChannelIds.has(entitlement.channelId) !== true) {
        return records;
      }

      records.push({
        channelId: entitlement.channelId,
        endpoint: entitlement.endpoint,
        model: entitlement.model,
      });
      return records;
    },
    [],
  );
}

function StatusBadge({ label, active = false }: { label: string; active?: boolean }) {
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

export default function AdminPlanForm() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { planId = '' } = useParams();
  const isCreateMode = planId.length === 0;
  const [form, setForm] = useState<PlanFormState>(emptyPlanState);
  const planQuery = useGetAdminPlanQuery(planId, {
    enabled: isCreateMode !== true && planId.length > 0,
  });
  const channelsQuery = useGetAdminChannelsQuery();
  const createMutation = useCreateAdminPlanMutation();
  const updateMutation = useUpdateAdminPlanMutation();
  const deleteMutation = useDeleteAdminPlanMutation();

  useEffect(() => {
    if (!planQuery.data) {
      return;
    }

    const modelEntitlements =
      planQuery.data.modelEntitlements.length > 0
        ? planQuery.data.modelEntitlements
        : deriveLegacyModelEntitlements(
            planQuery.data.channelIds,
            channelsQuery.data?.channels ?? [],
          );

    setForm({
      name: planQuery.data.name,
      slug: planQuery.data.slug,
      description: planQuery.data.description,
      enabled: planQuery.data.enabled,
      isDefault: planQuery.data.isDefault,
      sortOrder: String(planQuery.data.sortOrder),
      modelEntitlements,
      notes: planQuery.data.notes,
      startingCredits:
        planQuery.data.startingCredits == null ? '' : String(planQuery.data.startingCredits),
    });
  }, [planQuery.data, channelsQuery.data?.channels]);

  const channels = channelsQuery.data?.channels ?? [];
  const availableEntitlements = createAvailablePlanModelEntitlements(channels);
  const availableEntitlementKeySet = new Set(
    availableEntitlements.map((entitlement) => createEntitlementKey(entitlement)),
  );
  const selectedEntitlementKeySet = new Set(
    form.modelEntitlements.map((entitlement) => createEntitlementKey(entitlement)),
  );
  const missingEntitlements = form.modelEntitlements.filter(
    (entitlement) => availableEntitlementKeySet.has(createEntitlementKey(entitlement)) !== true,
  );

  const mutationError =
    toErrorMessage(createMutation.error) ??
    toErrorMessage(updateMutation.error) ??
    toErrorMessage(deleteMutation.error);

  const submitDisabled =
    createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;
  const selectedCount = form.modelEntitlements.length;
  const closeModal = () => navigate('/d/admin/plans');

  return (
    <OGDialog open={true} onOpenChange={(open) => !open && closeModal()}>
      <OGDialogPortal>
        <OGDialogOverlay className="bg-black/50 backdrop-blur-sm" />
        <OGDialogContent
          className="admin-console fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-0 shadow-2xl focus:outline-none"
          showCloseButton={true}
        >
          <OGDialogTitle className="sr-only">
            {isCreateMode
              ? localize('com_ui_admin_create_plan')
              : localize('com_ui_admin_plan_details')}
          </OGDialogTitle>

          <div className="shrink-0 border-b border-border-light px-6 py-5">
            {!isCreateMode && planQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : !isCreateMode && !planQuery.data ? (
              <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
            ) : (
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                    <Layers3 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        {isCreateMode
                          ? localize('com_ui_admin_create_plan')
                          : form.name || localize('com_ui_admin_plan_details')}
                      </h2>
                      <AdminHelpButton
                        title="com_ui_admin_plan_details"
                        description="com_ui_admin_plan_details_description"
                      />
                      <StatusBadge
                        active={form.enabled}
                        label={
                          form.enabled
                            ? localize('com_ui_admin_enabled')
                            : localize('com_ui_admin_disabled')
                        }
                      />
                      {form.isDefault && (
                        <StatusBadge active={true} label={localize('com_ui_admin_default_plan')} />
                      )}
                      <StatusBadge
                        label={`${selectedCount} ${localize('com_ui_admin_plan_model_entitlements').toLowerCase()}`}
                      />
                      <StatusBadge
                        label={`${localize('com_ui_admin_starting_credits')}: ${
                          form.startingCredits.trim().length === 0
                            ? localize('com_ui_none')
                            : form.startingCredits
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!(!isCreateMode && (planQuery.isLoading || !planQuery.data)) && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();

                const payload = {
                  name: form.name.trim(),
                  slug: form.slug.trim(),
                  description: form.description.trim(),
                  enabled: form.enabled,
                  isDefault: form.isDefault,
                  sortOrder: Number(form.sortOrder || '0'),
                  channelIds: [],
                  modelEntitlements: form.modelEntitlements,
                  notes: form.notes.trim(),
                  startingCredits:
                    form.startingCredits.trim().length === 0 ? null : Number(form.startingCredits),
                };

                if (isCreateMode) {
                  createMutation.mutate(payload, {
                    onSuccess: (plan) => {
                      navigate(`/d/admin/plans/${plan.id}`);
                    },
                  });
                  return;
                }

                updateMutation.mutate(
                  {
                    planId,
                    ...payload,
                  },
                  {
                    onSuccess: () => {
                      navigate(`/d/admin/plans/${planId}`);
                    },
                  },
                );
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="grid gap-6">
                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_plan_identity_title')}
                      </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_name')}
                        <input
                          required={true}
                          value={form.name}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, name: event.target.value }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_slug')}
                        <input
                          required={true}
                          value={form.slug}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, slug: event.target.value }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                    </div>

                    <label className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_description')}
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      />
                    </label>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_sort_order')}
                        <input
                          type="number"
                          value={form.sortOrder}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_starting_credits')}
                        <input
                          type="number"
                          min="0"
                          value={form.startingCredits}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              startingCredits: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_plan_model_entitlements')}
                      </h2>
                    </div>

                    <div className="rounded-2xl border border-border-medium bg-background p-4">
                      {channelsQuery.isLoading ? (
                        <div className="text-sm text-text-secondary">
                          {localize('com_ui_loading')}
                        </div>
                      ) : availableEntitlements.length === 0 ? (
                        <div className="text-sm text-text-secondary">
                          {localize('com_ui_admin_no_models_available')}
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {channels.map((channel) => {
                            const channelEntitlements = availableEntitlements.filter(
                              (entitlement) => entitlement.channelId === channel.id,
                            );

                            if (channelEntitlements.length === 0) {
                              return null;
                            }

                            return (
                              <section
                                key={channel.id}
                                className="grid gap-3 rounded-2xl border border-border-light bg-surface-primary px-4 py-4"
                              >
                                <div>
                                  <div className="font-medium text-text-primary">
                                    {channel.name}
                                  </div>
                                  <div className="text-xs text-text-secondary">{channel.slug}</div>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {channelEntitlements.map((entitlement) => {
                                    const entitlementKey = createEntitlementKey(entitlement);
                                    const checked = selectedEntitlementKeySet.has(entitlementKey);

                                    return (
                                      <label
                                        key={entitlementKey}
                                        className="flex items-start gap-3 rounded-xl border border-border-light bg-background px-4 py-3 text-sm text-text-primary"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) =>
                                            setForm((current) => ({
                                              ...current,
                                              modelEntitlements: event.target.checked
                                                ? [
                                                    ...current.modelEntitlements,
                                                    {
                                                      channelId: entitlement.channelId,
                                                      endpoint: entitlement.endpoint,
                                                      model: entitlement.model,
                                                    },
                                                  ]
                                                : current.modelEntitlements.filter(
                                                    (currentEntitlement) =>
                                                      createEntitlementKey(currentEntitlement) !==
                                                      entitlementKey,
                                                  ),
                                            }))
                                          }
                                        />
                                        <span className="min-w-0">
                                          <span className="block font-medium">
                                            {entitlement.model}
                                          </span>
                                          <span className="block text-xs text-text-secondary">
                                            {entitlement.endpoint}
                                          </span>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}

                      {missingEntitlements.length > 0 && (
                        <div className="mt-4 grid gap-2 border-t border-border-light pt-4">
                          <p className="text-xs font-medium text-text-secondary">
                            {localize('com_ui_admin_missing_model_entitlements')}
                          </p>
                          {missingEntitlements.map((entitlement) => {
                            const entitlementKey = createEntitlementKey(entitlement);

                            return (
                              <div
                                key={entitlementKey}
                                className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-surface-primary px-4 py-3 text-sm text-text-primary"
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium">
                                    {`${entitlement.endpoint} / ${entitlement.model}`}
                                  </span>
                                  <span className="block text-xs text-text-secondary">
                                    {localize('com_ui_admin_missing_model_entitlement_description')}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  className="admin-button-secondary rounded-xl px-3 py-1.5 text-xs font-medium"
                                  onClick={() =>
                                    setForm((current) => ({
                                      ...current,
                                      modelEntitlements: current.modelEntitlements.filter(
                                        (currentEntitlement) =>
                                          createEntitlementKey(currentEntitlement) !==
                                          entitlementKey,
                                      ),
                                    }))
                                  }
                                >
                                  {localize('com_ui_remove')}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_plan_policy_title')}
                      </h2>
                    </div>

                    <label className="flex flex-col gap-2 text-sm text-text-secondary">
                      {localize('com_ui_admin_notes')}
                      <textarea
                        rows={4}
                        value={form.notes}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, notes: event.target.value }))
                        }
                        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                      />
                    </label>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-3 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={form.enabled}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, enabled: event.target.checked }))
                          }
                        />
                        {localize('com_ui_admin_enabled')}
                      </label>
                      <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-3 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={form.isDefault}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, isDefault: event.target.checked }))
                          }
                        />
                        {localize('com_ui_admin_default_plan')}
                      </label>
                    </div>
                  </section>

                  {mutationError && (
                    <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {mutationError}
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-border-light px-6 py-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreateMode ? localize('com_ui_create') : localize('com_ui_save_changes')}
                  </button>
                  {!isCreateMode && (
                    <button
                      type="button"
                      disabled={submitDisabled}
                      className="admin-button-danger rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        if (!window.confirm(localize('com_ui_admin_delete_plan_confirm'))) {
                          return;
                        }

                        deleteMutation.mutate(planId, {
                          onSuccess: () => {
                            closeModal();
                          },
                        });
                      }}
                    >
                      {localize('com_ui_delete')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitDisabled}
                    className="admin-button-secondary rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {localize('com_ui_cancel')}
                  </button>
                </div>
              </div>
            </form>
          )}
        </OGDialogContent>
      </OGDialogPortal>
    </OGDialog>
  );
}
