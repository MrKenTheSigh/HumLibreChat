import { useEffect, useMemo, useState } from 'react';
import { Brain, Save, Settings } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import type { AdminMemorySystemSetting } from 'librechat-data-provider';
import {
  useGetAdminChannelsQuery,
  useGetAdminSystemSettingsQuery,
  useUpdateAdminMemorySystemSettingMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminHelpButton from '../AdminHelpButton';
import AdminLayout from '../AdminLayout';

const defaultMemoryForm: AdminMemorySystemSetting = {
  enabled: false,
  validKeys: [],
  tokenLimit: 10000,
  messageWindowSize: 5,
  agent: {
    provider: 'ollama',
    model: 'gemma4:e4b',
    instructions:
      'You are a memory management assistant. Store and manage user information accurately.',
    model_parameters: {
      temperature: 0,
    },
  },
};

function toValidKeysInput(validKeys: string[]) {
  return validKeys.join(', ');
}

function parseValidKeys(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseModelParameters(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const parsed = JSON.parse(trimmed);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model parameters must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

export default function AdminSystemSettingsPage() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const settingsQuery = useGetAdminSystemSettingsQuery();
  const channelsQuery = useGetAdminChannelsQuery();
  const updateMemoryMutation = useUpdateAdminMemorySystemSettingMutation();
  const [memoryForm, setMemoryForm] = useState<AdminMemorySystemSetting>(defaultMemoryForm);
  const [validKeysInput, setValidKeysInput] = useState(toValidKeysInput(defaultMemoryForm.validKeys));
  const [modelParametersInput, setModelParametersInput] = useState(
    JSON.stringify(defaultMemoryForm.agent.model_parameters, null, 2),
  );

  useEffect(() => {
    const memory = settingsQuery.data?.memory;
    if (!memory) {
      return;
    }

    setMemoryForm(memory);
    setValidKeysInput(toValidKeysInput(memory.validKeys));
    setModelParametersInput(JSON.stringify(memory.agent.model_parameters ?? {}, null, 2));
  }, [settingsQuery.data?.memory]);

  const channelOptions = useMemo(() => {
    return (channelsQuery.data?.channels ?? [])
      .filter((channel) => channel.enabled)
      .flatMap((channel) =>
        channel.models
          .filter((model) => model.enabled)
          .map((model) => ({
            value: `${channel.connection.runtimeEndpoint || channel.providerType}::${model.model}`,
            provider: channel.connection.runtimeEndpoint || channel.providerType,
            model: model.model,
            label: `${channel.name} / ${model.model}`,
          })),
      );
  }, [channelsQuery.data?.channels]);

  const selectedModelValue = `${memoryForm.agent.provider}::${memoryForm.agent.model}`;

  const setAgentModel = (value: string) => {
    const [provider, model] = value.split('::');
    if (!provider || !model) {
      return;
    }

    setMemoryForm((current) => ({
      ...current,
      agent: {
        ...current.agent,
        provider,
        model,
      },
    }));
  };

  const saveMemorySettings = async () => {
    try {
      const modelParameters = parseModelParameters(modelParametersInput);
      const validKeys = parseValidKeys(validKeysInput);

      await updateMemoryMutation.mutateAsync({
        ...memoryForm,
        validKeys,
        tokenLimit: memoryForm.tokenLimit == null ? null : Number(memoryForm.tokenLimit),
        messageWindowSize: Number(memoryForm.messageWindowSize),
        agent: {
          ...memoryForm.agent,
          model_parameters: modelParameters,
        },
      });
      showToast({
        status: 'success',
        message: localize('com_ui_admin_system_settings_saved'),
      });
    } catch (error) {
      showToast({
        status: 'error',
        message: error instanceof Error ? error.message : localize('com_ui_error_save_admin_settings'),
      });
    }
  };

  return (
    <AdminLayout title={localize('com_ui_admin_system_settings')} hideHeader={true}>
      <div className="flex h-full flex-col gap-6">
        <section className="rounded-3xl border border-border-medium bg-surface-primary p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-text-primary">
                <Settings className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium text-text-primary">
                  {localize('com_ui_admin_system_settings')}
                </h1>
                <AdminHelpButton
                  title="com_ui_admin_system_settings"
                  description="com_ui_admin_system_settings_description"
                />
              </div>
            </div>

            <button
              type="button"
              className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              onClick={saveMemorySettings}
              disabled={updateMemoryMutation.isLoading || settingsQuery.isLoading}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {localize('com_ui_save')}
            </button>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto rounded-3xl border border-border-medium bg-surface-primary p-5">
          {settingsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border-medium bg-background p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-primary text-text-primary">
                    <Brain className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {localize('com_ui_memories')}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {memoryForm.enabled
                        ? localize('com_ui_admin_enabled')
                        : localize('com_ui_admin_disabled')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border-medium bg-background p-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface-primary px-4 py-3">
                    <span className="text-sm font-medium text-text-primary">
                      {localize('com_ui_admin_system_memory_enabled')}
                    </span>
                    <input
                      type="checkbox"
                      checked={memoryForm.enabled}
                      onChange={(event) =>
                        setMemoryForm((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                      className="h-4 w-4"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary">
                    {localize('com_ui_admin_system_memory_agent')}
                    <select
                      value={selectedModelValue}
                      onChange={(event) => setAgentModel(event.target.value)}
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                    >
                      {channelOptions.some((option) => option.value === selectedModelValue) ? null : (
                        <option value={selectedModelValue}>
                          {memoryForm.agent.provider} / {memoryForm.agent.model}
                        </option>
                      )}
                      {channelOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary">
                    {localize('com_ui_admin_system_memory_token_limit')}
                    <input
                      type="number"
                      min={1}
                      value={memoryForm.tokenLimit ?? ''}
                      onChange={(event) =>
                        setMemoryForm((current) => ({
                          ...current,
                          tokenLimit:
                            event.target.value.length === 0 ? null : Number(event.target.value),
                        }))
                      }
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary">
                    {localize('com_ui_admin_system_memory_window')}
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={memoryForm.messageWindowSize}
                      onChange={(event) =>
                        setMemoryForm((current) => ({
                          ...current,
                          messageWindowSize: Number(event.target.value),
                        }))
                      }
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary lg:col-span-2">
                    {localize('com_ui_admin_system_memory_valid_keys')}
                    <input
                      type="text"
                      value={validKeysInput}
                      onChange={(event) => setValidKeysInput(event.target.value)}
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary lg:col-span-2">
                    {localize('com_ui_admin_system_memory_instructions')}
                    <textarea
                      value={memoryForm.agent.instructions}
                      onChange={(event) =>
                        setMemoryForm((current) => ({
                          ...current,
                          agent: {
                            ...current.agent,
                            instructions: event.target.value,
                          },
                        }))
                      }
                      rows={4}
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm text-text-secondary lg:col-span-2">
                    {localize('com_ui_admin_system_memory_model_parameters')}
                    <textarea
                      value={modelParametersInput}
                      onChange={(event) => setModelParametersInput(event.target.value)}
                      rows={5}
                      spellCheck={false}
                      className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 font-mono text-sm text-text-primary"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
