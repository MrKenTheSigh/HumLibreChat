import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TError } from 'librechat-data-provider';
import {
  useCreateAdminPlanMutation,
  useGetAdminChannelsQuery,
  useDeleteAdminPlanMutation,
  useGetAdminPlanQuery,
  useUpdateAdminPlanMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

type PlanFormState = {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  sortOrder: string;
  channelIds: string[];
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
  channelIds: [],
  notes: '',
  startingCredits: '',
};

function toErrorMessage(error: TError | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
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

    setForm({
      name: planQuery.data.name,
      slug: planQuery.data.slug,
      description: planQuery.data.description,
      enabled: planQuery.data.enabled,
      isDefault: planQuery.data.isDefault,
      sortOrder: String(planQuery.data.sortOrder),
      channelIds: planQuery.data.channelIds,
      notes: planQuery.data.notes,
      startingCredits:
        planQuery.data.startingCredits == null ? '' : String(planQuery.data.startingCredits),
    });
  }, [planQuery.data]);

  const channels = channelsQuery.data?.channels ?? [];
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const missingChannelIds = form.channelIds.filter((channelId) => channelMap.has(channelId) !== true);

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
              channelIds: form.channelIds,
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
            <span>{localize('com_ui_admin_channel_ids')}</span>
            <div className="rounded-xl border border-border-medium bg-surface-primary p-3">
              {channelsQuery.isLoading ? (
                <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
              ) : channels.length === 0 ? (
                <div className="text-sm text-text-secondary">
                  {localize('com_ui_admin_no_channels_available')}
                </div>
              ) : (
                <div className="grid gap-3">
                  {channels.map((channel) => {
                    const checked = form.channelIds.includes(channel.id);

                    return (
                      <label
                        key={channel.id}
                        className="flex items-start gap-3 rounded-xl border border-border-light bg-background px-4 py-3 text-sm text-text-primary"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              channelIds: event.target.checked
                                ? [...current.channelIds, channel.id]
                                : current.channelIds.filter((channelId) => channelId !== channel.id),
                            }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{channel.name}</span>
                          <span className="block text-xs text-text-secondary">{channel.slug}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {missingChannelIds.length > 0 && (
                <div className="mt-4 grid gap-2 border-t border-border-light pt-4">
                  <p className="text-xs font-medium text-text-secondary">
                    {localize('com_ui_admin_missing_channels')}
                  </p>
                  {missingChannelIds.map((channelId) => (
                    <div
                      key={channelId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/30 bg-background px-4 py-3 text-sm text-text-primary"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{channelId}</span>
                        <span className="block text-xs text-text-secondary">
                          {localize('com_ui_admin_missing_channel_description')}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-border-medium px-3 py-1 text-xs text-text-secondary"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            channelIds: current.channelIds.filter((value) => value !== channelId),
                          }))
                        }
                      >
                        {localize('com_ui_remove')}
                      </button>
                    </div>
                  ))}
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
