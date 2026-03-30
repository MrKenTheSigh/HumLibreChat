import { useEffect, useState } from 'react';
import { Blocks } from 'lucide-react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogOverlay,
  OGDialogPortal,
  OGDialogTitle,
} from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  AdminChannelHeader,
  AdminChannelModel,
  AdminChannelPricingOverride,
  AdminChannelProviderType,
  TError,
} from 'librechat-data-provider';
import {
  useCreateAdminChannelMutation,
  useDeleteAdminChannelMutation,
  useGetAdminChannelInventoryQuery,
  useGetAdminChannelQuery,
  useUpdateAdminChannelMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';

type HeaderFormState = AdminChannelHeader;

type PricingFormState = {
  prompt: string;
  completion: string;
  write: string;
  read: string;
};

type ModelFormState = {
  formId: string;
  model: string;
  enabled: boolean;
  deploymentName: string;
  pricingOverride: PricingFormState;
};

type ModelSuggestion = {
  model: string;
  defaultRates: AdminChannelPricingOverride | null;
};

type ChannelFormState = {
  name: string;
  slug: string;
  providerType: AdminChannelProviderType;
  description: string;
  enabled: boolean;
  sortOrder: string;
  connection: {
    runtimeEndpoint: string;
    baseURL: string;
    instanceName: string;
    apiVersion: string;
    region: string;
    modelFetch: boolean;
    headers: HeaderFormState[];
  };
  secrets: {
    apiKey: string;
    apiKeyRef: string;
    accessKeyId: string;
    accessKeyIdRef: string;
    secretAccessKey: string;
    secretAccessKeyRef: string;
    sessionToken: string;
    sessionTokenRef: string;
  };
  models: ModelFormState[];
};

const emptyPricingState: PricingFormState = {
  prompt: '',
  completion: '',
  write: '',
  read: '',
};

let nextModelFormId = 0;

function createModelFormId(): string {
  nextModelFormId += 1;
  return `channel-model-${nextModelFormId}`;
}

const emptyHeaderState: HeaderFormState = {
  key: '',
  value: '',
};

function createEmptyModelState(): ModelFormState {
  return {
    formId: createModelFormId(),
    model: '',
    enabled: true,
    deploymentName: '',
    pricingOverride: emptyPricingState,
  };
}

function getRuntimeEndpoint(providerType: AdminChannelProviderType): string {
  return providerType === 'custom' ? '' : providerType;
}

function getInventoryEndpoint(providerType: AdminChannelProviderType): string | null {
  return providerType === 'custom' ? null : providerType;
}

function usesApiKeySecrets(providerType: AdminChannelProviderType): boolean {
  return (
    providerType === 'azureOpenAI' ||
    providerType === 'custom' ||
    providerType === 'openAI' ||
    providerType === 'google' ||
    providerType === 'anthropic'
  );
}

function usesBaseUrl(providerType: AdminChannelProviderType): boolean {
  return (
    providerType === 'custom' ||
    providerType === 'ollama' ||
    providerType === 'openAI' ||
    providerType === 'google' ||
    providerType === 'anthropic'
  );
}

function getDefaultBaseUrl(providerType: AdminChannelProviderType): string {
  if (providerType === 'ollama') {
    return 'http://localhost:11434/v1';
  }

  return '';
}

const emptyChannelState: ChannelFormState = {
  name: '',
  slug: '',
  providerType: 'azureOpenAI',
  description: '',
  enabled: true,
  sortOrder: '0',
  connection: {
    runtimeEndpoint: getRuntimeEndpoint('azureOpenAI'),
    baseURL: '',
    instanceName: '',
    apiVersion: '',
    region: '',
    modelFetch: false,
    headers: [],
  },
  secrets: {
    apiKey: '',
    apiKeyRef: '',
    accessKeyId: '',
    accessKeyIdRef: '',
    secretAccessKey: '',
    secretAccessKeyRef: '',
    sessionToken: '',
    sessionTokenRef: '',
  },
  models: [createEmptyModelState()],
};

function toErrorMessage(error: TError | null | undefined): string | null {
  return error?.response?.data?.message ?? error?.message ?? null;
}

function toPricingFormState(
  pricingOverride: AdminChannelPricingOverride | null | undefined,
): PricingFormState {
  return {
    prompt: pricingOverride?.prompt != null ? String(pricingOverride.prompt) : '',
    completion: pricingOverride?.completion != null ? String(pricingOverride.completion) : '',
    write: pricingOverride?.write != null ? String(pricingOverride.write) : '',
    read: pricingOverride?.read != null ? String(pricingOverride.read) : '',
  };
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPricingOverride(pricingOverride: PricingFormState): AdminChannelPricingOverride | null {
  const normalized = {
    prompt: toNumberOrNull(pricingOverride.prompt),
    completion: toNumberOrNull(pricingOverride.completion),
    write: toNumberOrNull(pricingOverride.write),
    read: toNumberOrNull(pricingOverride.read),
  };

  if (Object.values(normalized).every((value) => value == null)) {
    return null;
  }

  return normalized;
}

function toModelFormState(model: AdminChannelModel): ModelFormState {
  return {
    formId: createModelFormId(),
    model: model.model,
    enabled: model.enabled,
    deploymentName: model.deploymentName,
    pricingOverride: toPricingFormState(model.pricingOverride),
  };
}

function providerTypeLabel(
  providerType: AdminChannelProviderType,
  localize: ReturnType<typeof useLocalize>,
): string {
  if (providerType === 'azureOpenAI') {
    return localize('com_ui_admin_channel_provider_type_azure_openai');
  }

  if (providerType === 'custom') {
    return localize('com_ui_admin_channel_provider_type_custom');
  }

  if (providerType === 'ollama') {
    return localize('com_ui_admin_channel_provider_type_ollama');
  }

  if (providerType === 'openAI') {
    return localize('com_ui_admin_channel_provider_type_openai');
  }

  if (providerType === 'google') {
    return localize('com_ui_admin_channel_provider_type_google');
  }

  if (providerType === 'anthropic') {
    return localize('com_ui_admin_channel_provider_type_anthropic');
  }

  return localize('com_ui_admin_channel_provider_type_bedrock');
}

function toRateValue(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

function mergeSuggestedRates(
  currentPricing: PricingFormState,
  previousDefaults: AdminChannelPricingOverride | null,
  nextDefaults: AdminChannelPricingOverride | null,
): PricingFormState {
  const resolveField = (field: keyof PricingFormState): string => {
    const currentValue = currentPricing[field];
    const previousValue = toRateValue(previousDefaults?.[field] ?? null);
    if (currentValue.trim().length > 0 && currentValue !== previousValue) {
      return currentValue;
    }

    return toRateValue(nextDefaults?.[field] ?? null);
  };

  return {
    prompt: resolveField('prompt'),
    completion: resolveField('completion'),
    write: resolveField('write'),
    read: resolveField('read'),
  };
}

function getSelectedSuggestionValue(
  modelValue: string,
  modelSuggestionsMap: Map<string, ModelSuggestion>,
): string {
  const trimmedModel = modelValue.trim();
  if (trimmedModel.length === 0) {
    return '';
  }

  return modelSuggestionsMap.has(trimmedModel) ? trimmedModel : '';
}

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

export default function AdminChannelForm() {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { channelId = '' } = useParams();
  const isCreateMode = channelId.length === 0;
  const [form, setForm] = useState<ChannelFormState>(emptyChannelState);
  const [clientError, setClientError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const channelInventoryQuery = useGetAdminChannelInventoryQuery();
  const channelQuery = useGetAdminChannelQuery(channelId, {
    enabled: isCreateMode !== true && channelId.length > 0,
  });
  const createMutation = useCreateAdminChannelMutation();
  const updateMutation = useUpdateAdminChannelMutation();
  const deleteMutation = useDeleteAdminChannelMutation();

  useEffect(() => {
    if (!channelQuery.data) {
      return;
    }

    setForm({
      name: channelQuery.data.name,
      slug: channelQuery.data.slug,
      providerType: channelQuery.data.providerType,
      description: channelQuery.data.description,
      enabled: channelQuery.data.enabled,
      sortOrder: String(channelQuery.data.sortOrder),
      connection: {
        runtimeEndpoint: channelQuery.data.connection.runtimeEndpoint,
        baseURL: channelQuery.data.connection.baseURL,
        instanceName: channelQuery.data.connection.instanceName,
        apiVersion: channelQuery.data.connection.apiVersion,
        region: channelQuery.data.connection.region,
        modelFetch: channelQuery.data.connection.modelFetch,
        headers: channelQuery.data.connection.headers,
      },
      secrets: {
        apiKey: channelQuery.data.secrets.apiKey,
        apiKeyRef: channelQuery.data.secrets.apiKeyRef,
        accessKeyId: channelQuery.data.secrets.accessKeyId,
        accessKeyIdRef: channelQuery.data.secrets.accessKeyIdRef,
        secretAccessKey: channelQuery.data.secrets.secretAccessKey,
        secretAccessKeyRef: channelQuery.data.secrets.secretAccessKeyRef,
        sessionToken: channelQuery.data.secrets.sessionToken,
        sessionTokenRef: channelQuery.data.secrets.sessionTokenRef,
      },
      models:
        channelQuery.data.models.length > 0
          ? channelQuery.data.models.map(toModelFormState)
          : [createEmptyModelState()],
    });
  }, [channelQuery.data]);

  useEffect(() => {
    if (form.providerType === 'custom') {
      return;
    }

    const expectedRuntimeEndpoint = getRuntimeEndpoint(form.providerType);
    if (form.connection.runtimeEndpoint === expectedRuntimeEndpoint) {
      return;
    }

    setForm((current) => ({
      ...current,
      connection: {
        ...current.connection,
        runtimeEndpoint: expectedRuntimeEndpoint,
      },
    }));
  }, [form.connection.runtimeEndpoint, form.providerType]);

  const mutationError =
    toErrorMessage(createMutation.error) ??
    toErrorMessage(updateMutation.error) ??
    toErrorMessage(deleteMutation.error);
  const inventoryEndpoint = getInventoryEndpoint(form.providerType);
  const modelSuggestions =
    inventoryEndpoint == null
      ? []
      : (channelInventoryQuery.data?.inventory ?? [])
          .filter((item) => item.endpoint === inventoryEndpoint)
          .map((item) => ({
            model: item.model,
            defaultRates: item.defaultRates,
          }));
  const modelSuggestionsMap = new Map<string, ModelSuggestion>(
    modelSuggestions.map((item) => [item.model, item]),
  );

  const updateModelAtIndex = (index: number, nextModelValue: string) => {
    setForm((current) => {
      const currentModel = current.models[index];
      if (currentModel == null) {
        return current;
      }

      const trimmedCurrentModel = currentModel.model.trim();
      const trimmedNextModel = nextModelValue.trim();
      const previousSuggestion =
        trimmedCurrentModel.length === 0 ? undefined : modelSuggestionsMap.get(trimmedCurrentModel);
      const nextSuggestion =
        trimmedNextModel.length === 0 ? undefined : modelSuggestionsMap.get(trimmedNextModel);

      return {
        ...current,
        models: current.models.map((model, currentIndex) => {
          if (currentIndex !== index) {
            return model;
          }

          return {
            ...model,
            model: nextModelValue,
            pricingOverride: mergeSuggestedRates(
              model.pricingOverride,
              previousSuggestion?.defaultRates ?? null,
              nextSuggestion?.defaultRates ?? null,
            ),
          };
        }),
      };
    });
  };

  const submitDisabled =
    createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading;
  const closeModal = () => navigate('/d/admin/channels');
  const modelCount = form.models.filter((model) => model.model.trim().length > 0).length;

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
              ? localize('com_ui_admin_create_channel')
              : localize('com_ui_admin_channel_details')}
          </OGDialogTitle>

          <div className="shrink-0 border-b border-border-light px-6 py-5">
            {!isCreateMode && channelQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border-medium bg-background p-6 text-sm text-text-secondary">
                {localize('com_ui_loading')}
              </div>
            ) : !isCreateMode && !channelQuery.data ? (
              <p className="text-sm text-text-secondary">{localize('com_ui_no_results_found')}</p>
            ) : (
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                    <Blocks className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        {isCreateMode
                          ? localize('com_ui_admin_create_channel')
                          : form.name || localize('com_ui_admin_channel_details')}
                      </h2>
                      <AdminHelpButton
                        title="com_ui_admin_channel_details"
                        description="com_ui_admin_channel_details_description"
                      />
                      <StatusBadge
                        active={true}
                        label={providerTypeLabel(form.providerType, localize)}
                      />
                      <StatusBadge
                        active={form.enabled}
                        label={
                          form.enabled
                            ? localize('com_ui_admin_enabled')
                            : localize('com_ui_admin_disabled')
                        }
                      />
                      <StatusBadge
                        active={modelCount > 0}
                        label={`${localize('com_ui_admin_channel_models')}: ${modelCount}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!(!isCreateMode && (channelQuery.isLoading || !channelQuery.data)) && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();

                if (form.models.every((model) => model.model.trim().length === 0)) {
                  setClientError(localize('com_ui_admin_channel_models_required'));
                  return;
                }

                setClientError(null);

                const payload = {
                  name: form.name.trim(),
                  slug: form.slug.trim(),
                  providerType: form.providerType,
                  description: form.description.trim(),
                  enabled: form.enabled,
                  sortOrder: Number(form.sortOrder || '0'),
                  connection: {
                    runtimeEndpoint: form.connection.runtimeEndpoint.trim(),
                    baseURL: form.connection.baseURL.trim(),
                    instanceName: form.connection.instanceName.trim(),
                    apiVersion: form.connection.apiVersion.trim(),
                    region: form.connection.region.trim(),
                    modelFetch: form.connection.modelFetch,
                    headers: form.connection.headers
                      .map((header) => ({
                        key: header.key.trim(),
                        value: header.value.trim(),
                      }))
                      .filter((header) => header.key.length > 0 && header.value.length > 0),
                  },
                  secrets: {
                    apiKey: form.secrets.apiKey.trim(),
                    apiKeyRef: form.secrets.apiKeyRef.trim(),
                    accessKeyId: form.secrets.accessKeyId.trim(),
                    accessKeyIdRef: form.secrets.accessKeyIdRef.trim(),
                    secretAccessKey: form.secrets.secretAccessKey.trim(),
                    secretAccessKeyRef: form.secrets.secretAccessKeyRef.trim(),
                    sessionToken: form.secrets.sessionToken.trim(),
                    sessionTokenRef: form.secrets.sessionTokenRef.trim(),
                  },
                  models: form.models
                    .map((model) => ({
                      model: model.model.trim(),
                      enabled: model.enabled,
                      deploymentName: model.deploymentName.trim(),
                      pricingOverride: toPricingOverride(model.pricingOverride),
                    }))
                    .filter((model) => model.model.length > 0),
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
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="grid gap-6">
                  <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_channel_identity_title')}
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

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_provider')}
                        <select
                          value={form.providerType}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextProviderType = event.target
                                .value as AdminChannelProviderType;
                              const nextRuntimeEndpoint = getRuntimeEndpoint(nextProviderType);
                              const nextBaseURL = getDefaultBaseUrl(nextProviderType);

                              return {
                                ...current,
                                providerType: nextProviderType,
                                connection: {
                                  ...current.connection,
                                  runtimeEndpoint: nextRuntimeEndpoint,
                                  baseURL:
                                    nextProviderType === 'ollama'
                                      ? nextBaseURL
                                      : current.connection.baseURL,
                                  modelFetch:
                                    nextProviderType === 'ollama'
                                      ? true
                                      : current.connection.modelFetch,
                                },
                                secrets:
                                  nextProviderType === 'ollama'
                                    ? {
                                        ...current.secrets,
                                        apiKey: '',
                                        apiKeyRef: '',
                                      }
                                    : current.secrets,
                              };
                            })
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="azureOpenAI">
                            {providerTypeLabel('azureOpenAI', localize)}
                          </option>
                          <option value="custom">{providerTypeLabel('custom', localize)}</option>
                          <option value="ollama">{providerTypeLabel('ollama', localize)}</option>
                          <option value="openAI">{providerTypeLabel('openAI', localize)}</option>
                          <option value="google">{providerTypeLabel('google', localize)}</option>
                          <option value="anthropic">
                            {providerTypeLabel('anthropic', localize)}
                          </option>
                          <option value="bedrock">{providerTypeLabel('bedrock', localize)}</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_admin_channel_runtime_endpoint')}
                        <input
                          required={true}
                          disabled={form.providerType !== 'custom'}
                          value={form.connection.runtimeEndpoint}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              connection: {
                                ...current.connection,
                                runtimeEndpoint: event.target.value,
                              },
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
                    </div>
                  </section>

                  <section className="grid gap-4 rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_channel_connection')}
                      </div>
                    </div>

                    {usesBaseUrl(form.providerType) && (
                      <>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_base_url')}
                          <input
                            value={form.connection.baseURL}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                connection: {
                                  ...current.connection,
                                  baseURL: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        {(form.providerType === 'custom' || form.providerType === 'ollama') && (
                          <label className="flex items-center gap-3 rounded-xl border border-border-medium bg-background px-4 py-3 text-sm text-text-primary">
                            <input
                              type="checkbox"
                              checked={form.connection.modelFetch}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  connection: {
                                    ...current.connection,
                                    modelFetch: event.target.checked,
                                  },
                                }))
                              }
                            />
                            {localize('com_ui_admin_channel_model_fetch')}
                          </label>
                        )}
                      </>
                    )}

                    {form.providerType === 'azureOpenAI' && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_instance_name')}
                          <input
                            value={form.connection.instanceName}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                connection: {
                                  ...current.connection,
                                  instanceName: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_api_version')}
                          <input
                            value={form.connection.apiVersion}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                connection: {
                                  ...current.connection,
                                  apiVersion: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                      </div>
                    )}

                    {form.providerType === 'bedrock' && (
                      <label className="flex flex-col gap-2 text-sm text-text-secondary">
                        {localize('com_ui_region')}
                        <input
                          value={form.connection.region}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              connection: {
                                ...current.connection,
                                region: event.target.value,
                              },
                            }))
                          }
                          className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                        />
                      </label>
                    )}
                  </section>

                  <section className="grid gap-4 rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {localize('com_ui_admin_channel_secrets')}
                      </div>
                    </div>
                    {usesApiKeySecrets(form.providerType) && (
                      <div className="grid gap-4">
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_api_key')}
                          <div className="flex items-center gap-2">
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={form.secrets.apiKey}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  secrets: {
                                    ...current.secrets,
                                    apiKey: event.target.value,
                                  },
                                }))
                              }
                              className="min-w-0 flex-1 rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                            />
                            <button
                              type="button"
                              className="admin-button-secondary rounded-xl px-3 py-2 text-sm font-medium"
                              onClick={() => setShowApiKey((current) => !current)}
                            >
                              {showApiKey ? localize('com_ui_hide') : localize('com_ui_show')}
                            </button>
                          </div>
                        </label>
                      </div>
                    )}
                    {form.providerType === 'bedrock' && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_access_key_id')}
                          <input
                            value={form.secrets.accessKeyId}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  accessKeyId: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_access_key_id_ref')}
                          <input
                            value={form.secrets.accessKeyIdRef}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  accessKeyIdRef: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_secret_access_key')}
                          <input
                            value={form.secrets.secretAccessKey}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  secretAccessKey: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_secret_access_key_ref')}
                          <input
                            value={form.secrets.secretAccessKeyRef}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  secretAccessKeyRef: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary md:col-span-2">
                          {localize('com_ui_admin_channel_session_token')}
                          <input
                            value={form.secrets.sessionToken}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  sessionToken: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-text-secondary md:col-span-2">
                          {localize('com_ui_admin_channel_session_token_ref')}
                          <input
                            value={form.secrets.sessionTokenRef}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                secrets: {
                                  ...current.secrets,
                                  sessionTokenRef: event.target.value,
                                },
                              }))
                            }
                            className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </label>
                      </div>
                    )}
                  </section>

                  <section className="grid gap-4 rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {localize('com_ui_admin_channel_models')}
                        </div>
                        {modelSuggestions.length > 0 && (
                          <div className="text-xs text-text-secondary">
                            {localize('com_ui_admin_channel_models_builtin_available')}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
                        onClick={() => {
                          setClientError(null);
                          setForm((current) => ({
                            ...current,
                            models: [...current.models, createEmptyModelState()],
                          }));
                        }}
                      >
                        {localize('com_ui_add')}
                      </button>
                    </div>

                    <div className="grid gap-3">
                      {form.models.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-medium px-4 py-6 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_models_required')}
                        </div>
                      ) : (
                        form.models.map((model, index) => (
                          <div
                            key={model.formId}
                            className="grid gap-4 rounded-xl border border-border-medium bg-background p-4"
                          >
                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_admin_channel_builtin_model')}
                                <select
                                  disabled={modelSuggestions.length === 0}
                                  value={getSelectedSuggestionValue(
                                    model.model,
                                    modelSuggestionsMap,
                                  )}
                                  onChange={(event) =>
                                    updateModelAtIndex(index, event.target.value)
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <option value="">
                                    {modelSuggestions.length > 0
                                      ? localize('com_ui_admin_channel_builtin_model_empty')
                                      : localize('com_ui_admin_channel_builtin_model_none')}
                                  </option>
                                  {modelSuggestions.map((item) => (
                                    <option key={item.model} value={item.model}>
                                      {item.model}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_model')}
                                <input
                                  placeholder={localize('com_ui_admin_channel_model_placeholder')}
                                  value={model.model}
                                  onChange={(event) =>
                                    updateModelAtIndex(index, event.target.value)
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                />
                              </label>
                              {form.providerType === 'azureOpenAI' && (
                                <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                  {localize('com_ui_admin_channel_deployment_name')}
                                  <input
                                    value={model.deploymentName}
                                    onChange={(event) =>
                                      setForm((current) => ({
                                        ...current,
                                        models: current.models.map((currentModel, currentIndex) =>
                                          currentIndex === index
                                            ? {
                                                ...currentModel,
                                                deploymentName: event.target.value,
                                              }
                                            : currentModel,
                                        ),
                                      }))
                                    }
                                    className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                  />
                                </label>
                              )}
                            </div>

                            <div className="grid gap-4 md:grid-cols-4">
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_admin_channel_rate_prompt')}
                                <input
                                  type="number"
                                  step="any"
                                  placeholder={localize('com_ui_admin_channel_rate_placeholder')}
                                  value={model.pricingOverride.prompt}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      models: current.models.map((currentModel, currentIndex) =>
                                        currentIndex === index
                                          ? {
                                              ...currentModel,
                                              pricingOverride: {
                                                ...currentModel.pricingOverride,
                                                prompt: event.target.value,
                                              },
                                            }
                                          : currentModel,
                                      ),
                                    }))
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_admin_channel_rate_completion')}
                                <input
                                  type="number"
                                  step="any"
                                  placeholder={localize('com_ui_admin_channel_rate_placeholder')}
                                  value={model.pricingOverride.completion}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      models: current.models.map((currentModel, currentIndex) =>
                                        currentIndex === index
                                          ? {
                                              ...currentModel,
                                              pricingOverride: {
                                                ...currentModel.pricingOverride,
                                                completion: event.target.value,
                                              },
                                            }
                                          : currentModel,
                                      ),
                                    }))
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_admin_channel_rate_write')}
                                <input
                                  type="number"
                                  step="any"
                                  placeholder={localize('com_ui_admin_channel_rate_placeholder')}
                                  value={model.pricingOverride.write}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      models: current.models.map((currentModel, currentIndex) =>
                                        currentIndex === index
                                          ? {
                                              ...currentModel,
                                              pricingOverride: {
                                                ...currentModel.pricingOverride,
                                                write: event.target.value,
                                              },
                                            }
                                          : currentModel,
                                      ),
                                    }))
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                />
                              </label>
                              <label className="flex flex-col gap-2 text-sm text-text-secondary">
                                {localize('com_ui_admin_channel_rate_read')}
                                <input
                                  type="number"
                                  step="any"
                                  placeholder={localize('com_ui_admin_channel_rate_placeholder')}
                                  value={model.pricingOverride.read}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      models: current.models.map((currentModel, currentIndex) =>
                                        currentIndex === index
                                          ? {
                                              ...currentModel,
                                              pricingOverride: {
                                                ...currentModel.pricingOverride,
                                                read: event.target.value,
                                              },
                                            }
                                          : currentModel,
                                      ),
                                    }))
                                  }
                                  className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                                />
                              </label>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2 text-sm text-text-primary">
                                <input
                                  type="checkbox"
                                  checked={model.enabled}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      models: current.models.map((currentModel, currentIndex) =>
                                        currentIndex === index
                                          ? { ...currentModel, enabled: event.target.checked }
                                          : currentModel,
                                      ),
                                    }))
                                  }
                                />
                                {localize('com_ui_admin_enabled')}
                              </label>
                              <button
                                type="button"
                                className="admin-button-danger rounded-xl px-3 py-1.5 text-sm font-medium"
                                onClick={() => {
                                  setClientError(null);
                                  setForm((current) => ({
                                    ...current,
                                    models: current.models.filter(
                                      (_, currentIndex) => currentIndex !== index,
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
                  </section>

                  <section className="grid gap-4 rounded-3xl border border-border-medium bg-surface-primary p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {localize('com_ui_admin_channel_headers')}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="admin-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            connection: {
                              ...current.connection,
                              headers: [...current.connection.headers, emptyHeaderState],
                            },
                          }))
                        }
                      >
                        {localize('com_ui_add')}
                      </button>
                    </div>

                    <div className="grid gap-3">
                      {form.connection.headers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border-medium px-4 py-6 text-sm text-text-secondary">
                          {localize('com_ui_admin_channel_headers_empty')}
                        </div>
                      ) : (
                        form.connection.headers.map((header, index) => (
                          <div
                            key={`${header.key || 'header'}-${index}`}
                            className="grid gap-3 rounded-xl border border-border-medium bg-background p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          >
                            <input
                              placeholder={localize('com_ui_name')}
                              value={header.key}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  connection: {
                                    ...current.connection,
                                    headers: current.connection.headers.map(
                                      (currentHeader, currentIndex) =>
                                        currentIndex === index
                                          ? { ...currentHeader, key: event.target.value }
                                          : currentHeader,
                                    ),
                                  },
                                }))
                              }
                              className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                            />
                            <input
                              placeholder={localize('com_ui_value')}
                              value={header.value}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  connection: {
                                    ...current.connection,
                                    headers: current.connection.headers.map(
                                      (currentHeader, currentIndex) =>
                                        currentIndex === index
                                          ? { ...currentHeader, value: event.target.value }
                                          : currentHeader,
                                    ),
                                  },
                                }))
                              }
                              className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                            />
                            <button
                              type="button"
                              className="admin-button-danger rounded-xl px-3 py-2 text-sm font-medium"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  connection: {
                                    ...current.connection,
                                    headers: current.connection.headers.filter(
                                      (_, currentIndex) => currentIndex !== index,
                                    ),
                                  },
                                }))
                              }
                            >
                              {localize('com_ui_remove')}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {(clientError ?? mutationError) && (
                    <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {clientError ?? mutationError}
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
                        if (!window.confirm(localize('com_ui_admin_delete_channel_confirm'))) {
                          return;
                        }

                        deleteMutation.mutate(channelId, {
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
