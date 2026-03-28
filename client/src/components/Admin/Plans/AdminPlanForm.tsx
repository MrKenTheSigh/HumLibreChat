import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  AdminChannel,
  AdminPlanModelEntitlement,
  TError,
} from 'librechat-data-provider';
import {
  useCreateAdminPlanMutation,
  useGetAdminChannelsQuery,
  useDeleteAdminPlanMutation,
  useGetAdminPlanQuery,
  useUpdateAdminPlanMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

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

function toErrorMessage(error: TError | undefined): string | null {
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
        : deriveLegacyModelEntitlements(planQuery.data.channelIds, channelsQuery.data?.channels ?? []);

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

  if (!isCreateMode && planQuery.isLoading) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_plan_details')}
        description={localize('com_ui_admin_plan_details_description')}
      >
        <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
      </AdminLayout>
    );
  }

  if (!isCreateMode && !planQuery.data) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_plan_details')}
        description={localize('com_ui_admin_plan_details_description')}
      >
        <div className="space-y-4">
          <Link className="text-sm text-text-secondary underline" to="/d/admin/plans">
            {localize('com_ui_back')}
          </Link>
          <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
        </div>
      </AdminLayout>
    );
  }

  const submitDisabled =
    createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;

  return (
    <AdminLayout
      title={
        isCreateMode ? localize('com_ui_admin_create_plan') : localize('com_ui_admin_plan_details')
      }
      description={localize('com_ui_admin_plan_details_description')}
    >
      <div className="flex h-full flex-col gap-6">
        <div>
          <Link className="text-sm text-text-secondary underline" to="/d/admin/plans">
            {localize('com_ui_back')}
          </Link>
        </div>

        <form
          className="grid gap-4"
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_name')}
              <input
                required={true}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
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
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_ui_description')}
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_sort_order')}
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_starting_credits')}
              <input
                type="number"
                min="0"
                value={form.startingCredits}
                onChange={(event) =>
                  setForm((current) => ({ ...current, startingCredits: event.target.value }))
                }
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            <span>{localize('com_ui_admin_plan_model_entitlements')}</span>
            <div className="rounded-xl border border-border-medium bg-surface-primary p-3">
              {channelsQuery.isLoading ? (
                <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
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
                      <div
                        key={channel.id}
                        className="grid gap-3 rounded-xl border border-border-light bg-background px-4 py-3"
                      >
                        <div className="min-w-0">
                          <span className="block font-medium text-text-primary">{channel.name}</span>
                          <span className="block text-xs text-text-secondary">{channel.slug}</span>
                        </div>
                        <div className="grid gap-2">
                          {channelEntitlements.map((entitlement) => {
                            const entitlementKey = createEntitlementKey(entitlement);
                            const checked = selectedEntitlementKeySet.has(entitlementKey);

                            return (
                              <label
                                key={entitlementKey}
                                className="flex items-start gap-3 rounded-xl border border-border-light bg-surface-primary px-4 py-3 text-sm text-text-primary"
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
                                              createEntitlementKey(currentEntitlement) !== entitlementKey,
                                          ),
                                    }))
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="block font-medium">{entitlement.model}</span>
                                  <span className="block text-xs text-text-secondary">
                                    {entitlement.endpoint}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
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
                        className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-background px-4 py-3 text-sm text-text-primary"
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
                          className="rounded-lg border border-border-medium px-3 py-1 text-xs text-text-secondary"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              modelEntitlements: current.modelEntitlements.filter(
                                (currentEntitlement) =>
                                  createEntitlementKey(currentEntitlement) !== entitlementKey,
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
          </label>

          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_ui_admin_notes')}
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-surface-primary px-4 py-3 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              {localize('com_ui_admin_enabled')}
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-surface-primary px-4 py-3 text-sm text-text-primary">
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

          {mutationError && <p className="text-sm text-red-500">{mutationError}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitDisabled}
              className="rounded-xl bg-surface-hover px-4 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreateMode ? localize('com_ui_create') : localize('com_ui_save_changes')}
            </button>
            {!isCreateMode && (
              <button
                type="button"
                disabled={submitDisabled}
                className="rounded-xl border border-red-400 px-4 py-2 text-sm font-medium text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  if (!window.confirm(localize('com_ui_admin_delete_plan_confirm'))) {
                    return;
                  }

                  deleteMutation.mutate(planId, {
                    onSuccess: () => {
                      navigate('/d/admin/plans');
                    },
                  });
                }}
              >
                {localize('com_ui_delete')}
              </button>
            )}
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
