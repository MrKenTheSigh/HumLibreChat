import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { alternateName } from 'librechat-data-provider';
import type { TError } from 'librechat-data-provider';
import type { AdminChannelEntry } from 'librechat-data-provider';
import {
  useCreateAdminChannelMutation,
  useDeleteAdminChannelMutation,
  useGetAdminChannelInventoryQuery,
  useGetAdminChannelQuery,
  useUpdateAdminChannelMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminLayout from '../AdminLayout';

type ChannelFormState = {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  sortOrder: string;
  icon: string;
  entries: AdminChannelEntry[];
};

const emptyChannelState: ChannelFormState = {
  name: '',
  slug: '',
  description: '',
  enabled: true,
  sortOrder: '0',
  icon: '',
  entries: [],
};

function toErrorMessage(error: TError | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

function createEntryKey(entry: Pick<AdminChannelEntry, 'endpoint' | 'model'>): string {
  return `${entry.endpoint}::${entry.model}`;
}

function getEntryDisplayLabel(entry: Pick<AdminChannelEntry, 'endpoint' | 'model'>): string {
  const endpointLabel = (alternateName[entry.endpoint] as string | undefined) ?? entry.endpoint;
  return `${endpointLabel} / ${entry.model}`;
}

function normalizeEntryLabel(entry: AdminChannelEntry): string {
  const rawInventoryLabel = `${entry.endpoint} / ${entry.model}`;
  const displayLabel = getEntryDisplayLabel(entry);
  const trimmedLabel = entry.label.trim();

  if (trimmedLabel.length === 0 || trimmedLabel === rawInventoryLabel || trimmedLabel === displayLabel) {
    return displayLabel;
  }

  return trimmedLabel;
}

export default function AdminChannelForm() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { channelId = '' } = useParams();
  const isCreateMode = channelId.length === 0;
  const [form, setForm] = useState<ChannelFormState>(emptyChannelState);
  const [selectedInventoryKey, setSelectedInventoryKey] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const channelQuery = useGetAdminChannelQuery(channelId, {
    enabled: isCreateMode !== true && channelId.length > 0,
  });
  const inventoryQuery = useGetAdminChannelInventoryQuery();
  const createMutation = useCreateAdminChannelMutation();
  const updateMutation = useUpdateAdminChannelMutation();
  const deleteMutation = useDeleteAdminChannelMutation();
  const inventory = inventoryQuery.data?.inventory ?? [];
  const availableInventory = inventory.filter(
    (item) => form.entries.some((entry) => createEntryKey(entry) === createEntryKey(item)) !== true,
  );

  useEffect(() => {
    if (!channelQuery.data) {
      return;
    }

    setForm({
      name: channelQuery.data.name,
      slug: channelQuery.data.slug,
      description: channelQuery.data.description,
      enabled: channelQuery.data.enabled,
      sortOrder: String(channelQuery.data.sortOrder),
      icon: channelQuery.data.icon,
      entries: channelQuery.data.entries.map((entry) => ({
        ...entry,
        label: normalizeEntryLabel(entry),
      })),
    });
  }, [channelQuery.data]);

  useEffect(() => {
    const selectedStillAvailable = availableInventory.some(
      (item) => createEntryKey(item) === selectedInventoryKey,
    );

    if (selectedStillAvailable) {
      return;
    }

    setSelectedInventoryKey(
      availableInventory.length > 0 ? createEntryKey(availableInventory[0]) : '',
    );
  }, [availableInventory, selectedInventoryKey]);

  const mutationError =
    toErrorMessage(createMutation.error) ??
    toErrorMessage(updateMutation.error) ??
    toErrorMessage(deleteMutation.error);

  if (!isCreateMode && channelQuery.isLoading) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_channel_details')}
        description={localize('com_ui_admin_channel_details_description')}
      >
        <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
      </AdminLayout>
    );
  }

  if (!isCreateMode && !channelQuery.data) {
    return (
      <AdminLayout
        title={localize('com_ui_admin_channel_details')}
        description={localize('com_ui_admin_channel_details_description')}
      >
        <div className="space-y-4">
          <Link className="text-sm text-text-secondary underline" to="/d/admin/channels">
            {localize('com_ui_back')}
          </Link>
          <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
        </div>
      </AdminLayout>
    );
  }

  const submitDisabled =
    createMutation.isLoading ||
    updateMutation.isLoading ||
    deleteMutation.isLoading ||
    inventoryQuery.isLoading;

  return (
    <AdminLayout
      title={
        isCreateMode
          ? localize('com_ui_admin_create_channel')
          : localize('com_ui_admin_channel_details')
      }
      description={localize('com_ui_admin_channel_details_description')}
    >
      <div className="flex h-full flex-col gap-6">
        <div>
          <Link className="text-sm text-text-secondary underline" to="/d/admin/channels">
            {localize('com_ui_back')}
          </Link>
        </div>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();

            if (form.entries.length === 0) {
              setClientError(localize('com_ui_admin_channel_entries_required'));
              return;
            }

            setClientError(null);

            const payload = {
              name: form.name.trim(),
              slug: form.slug.trim(),
              description: form.description.trim(),
              enabled: form.enabled,
              sortOrder: Number(form.sortOrder || '0'),
              icon: form.icon.trim(),
              entries: form.entries.map((entry) => ({
                endpoint: entry.endpoint,
                model: entry.model,
                label: getEntryDisplayLabel(entry),
                enabled: entry.enabled,
                defaultParameters: null,
              })),
            };

            if (isCreateMode) {
              createMutation.mutate(payload, {
                onSuccess: (channel) => {
                  navigate(`/d/admin/channels/${channel.id}`);
                },
              });
              return;
            }

            updateMutation.mutate(
              {
                channelId,
                ...payload,
              },
              {
                onSuccess: () => {
                  navigate(`/d/admin/channels/${channelId}`);
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
              {localize('com_ui_icon')}
              <input
                placeholder={localize('com_ui_admin_icon_placeholder_disabled')}
                value={form.icon}
                onChange={(event) =>
                  setForm((current) => ({ ...current, icon: event.target.value }))
                }
                className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
            </label>
          </div>

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

          <div className="rounded-2xl border border-border-medium bg-surface-primary p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-text-primary">
                {localize('com_ui_admin_channel_entries')}
              </div>
              <div className="text-xs text-text-secondary">
                {localize('com_ui_admin_channel_entries_description')}
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={selectedInventoryKey}
                onChange={(event) => setSelectedInventoryKey(event.target.value)}
                disabled={availableInventory.length === 0}
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                {availableInventory.length === 0 ? (
                  <option value="">{localize('com_ui_no_results_found')}</option>
                ) : (
                  availableInventory.map((item) => (
                    <option key={createEntryKey(item)} value={createEntryKey(item)}>
                      {getEntryDisplayLabel(item)}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={availableInventory.length === 0}
                className="rounded-xl border border-border-medium px-4 py-2 text-sm font-medium text-text-primary"
                onClick={() => {
                  const inventoryItem = availableInventory.find(
                    (item) => createEntryKey(item) === selectedInventoryKey,
                  );

                  if (!inventoryItem) {
                    setClientError(localize('com_ui_admin_channel_inventory_missing'));
                    return;
                  }

                  if (
                    form.entries.some(
                      (entry) => createEntryKey(entry) === createEntryKey(inventoryItem),
                    )
                  ) {
                    setClientError(localize('com_ui_admin_channel_duplicate_entry'));
                    return;
                  }

                  setClientError(null);
                  setForm((current) => ({
                    ...current,
                    entries: [
                      ...current.entries,
                      {
                        endpoint: inventoryItem.endpoint,
                        model: inventoryItem.model,
                        label: getEntryDisplayLabel(inventoryItem),
                        enabled: true,
                        defaultParameters: null,
                      },
                    ],
                  }));
                }}
              >
                {localize('com_ui_add')}
              </button>
            </div>

            <div className="grid gap-3">
              {form.entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-medium px-4 py-6 text-sm text-text-secondary">
                  {localize('com_ui_admin_channel_entries_required')}
                </div>
              ) : (
                form.entries.map((entry) => (
                  <div
                    key={createEntryKey(entry)}
                    className="grid gap-3 rounded-xl border border-border-medium bg-background p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="text-sm font-medium text-text-primary">
                      {getEntryDisplayLabel(entry)}
                    </div>
                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <label className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              entries: current.entries.map((currentEntry) =>
                                createEntryKey(currentEntry) === createEntryKey(entry)
                                  ? { ...currentEntry, enabled: event.target.checked }
                                  : currentEntry,
                              ),
                            }))
                          }
                        />
                        {localize('com_ui_admin_enabled')}
                      </label>
                      <button
                        type="button"
                        className="text-sm text-red-500"
                        onClick={() => {
                          setClientError(null);
                          setForm((current) => ({
                            ...current,
                            entries: current.entries.filter(
                              (currentEntry) =>
                                createEntryKey(currentEntry) !== createEntryKey(entry),
                            ),
                          }));
                        }}
                      >
                        {localize('com_ui_remove')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {(clientError ?? mutationError) && (
            <p className="text-sm text-red-500">{clientError ?? mutationError}</p>
          )}

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
                  if (!window.confirm(localize('com_ui_admin_delete_channel_confirm'))) {
                    return;
                  }

                  deleteMutation.mutate(channelId, {
                    onSuccess: () => {
                      navigate('/d/admin/channels');
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
