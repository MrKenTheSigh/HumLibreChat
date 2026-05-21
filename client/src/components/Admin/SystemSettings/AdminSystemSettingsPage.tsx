import { useEffect, useMemo, useState } from 'react';
import { Brain, Globe, Save, Settings, ShieldAlert } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import type {
  AdminMemorySystemSetting,
  AdminSensitiveInformationPolicySystemSetting,
  AdminSensitivePolicyAction,
  AdminWebSearchSystemSetting,
} from 'librechat-data-provider';
import {
  useGetAdminChannelsQuery,
  useGetAdminSystemSettingsQuery,
  useUpdateAdminMemorySystemSettingMutation,
  useUpdateAdminSensitiveInformationPolicySystemSettingMutation,
  useUpdateAdminWebSearchSystemSettingMutation,
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

const sensitiveRuleCodes = [
  'chinese_name',
  'credit_card_number',
  'tw_national_id',
  'mobile_phone_number',
  'landline_phone_number',
  'address',
  'email_address',
  'encrypted_file',
] as const;

const sensitivePolicyGridColumns = 'grid-cols-[minmax(160px,1fr)_repeat(3,minmax(110px,110px))]';

const sensitiveRuleLocalizationKeys: Record<(typeof sensitiveRuleCodes)[number], string> = {
  address: 'com_ui_admin_sensitive_rule_address',
  chinese_name: 'com_ui_admin_sensitive_rule_chinese_name',
  credit_card_number: 'com_ui_admin_sensitive_rule_credit_card_number',
  email_address: 'com_ui_admin_sensitive_rule_email_address',
  encrypted_file: 'com_ui_admin_sensitive_rule_encrypted_file',
  landline_phone_number: 'com_ui_admin_sensitive_rule_landline_phone_number',
  mobile_phone_number: 'com_ui_admin_sensitive_rule_mobile_phone_number',
  tw_national_id: 'com_ui_admin_sensitive_rule_tw_national_id',
};

const sensitiveActions: AdminSensitivePolicyAction[] = ['record', 'warn', 'block'];
type SystemSettingSection = 'memory' | 'webSearch' | 'sensitivePolicy';

const defaultWebSearchForm: AdminWebSearchSystemSetting = {
  searchProvider: 'serper',
  scraperProvider: 'firecrawl',
  rerankerType: 'jina',
  serperApiKey: '',
  searxngInstanceUrl: '',
  searxngApiKey: '',
  firecrawlApiKey: '',
  firecrawlApiUrl: '',
  firecrawlVersion: '',
  jinaApiKey: '',
  jinaApiUrl: '',
  cohereApiKey: '',
  scraperTimeout: 7500,
  safeSearch: 1,
};

const defaultSensitivePolicyForm: AdminSensitiveInformationPolicySystemSetting = {
  enabled: false,
  window: {
    type: 'daily',
    durationDays: 1,
  },
  rules: sensitiveRuleCodes.map((ruleCode) => ({
    ruleCode,
    thresholds: [
      { minCount: 1, action: 'record' },
      { minCount: 20, action: 'warn' },
      { minCount: 50, action: 'block' },
    ],
  })),
};

type WebSearchSecretField =
  | 'serperApiKey'
  | 'searxngApiKey'
  | 'firecrawlApiKey'
  | 'jinaApiKey'
  | 'cohereApiKey';

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
  const updateWebSearchMutation = useUpdateAdminWebSearchSystemSettingMutation();
  const updateSensitivePolicyMutation =
    useUpdateAdminSensitiveInformationPolicySystemSettingMutation();
  const [memoryForm, setMemoryForm] = useState<AdminMemorySystemSetting>(defaultMemoryForm);
  const [webSearchForm, setWebSearchForm] =
    useState<AdminWebSearchSystemSetting>(defaultWebSearchForm);
  const [activeSection, setActiveSection] = useState<SystemSettingSection>('memory');
  const [sensitivePolicyForm, setSensitivePolicyForm] =
    useState<AdminSensitiveInformationPolicySystemSetting>(defaultSensitivePolicyForm);
  const [visibleWebSearchSecrets, setVisibleWebSearchSecrets] = useState<
    Record<WebSearchSecretField, boolean>
  >({
    serperApiKey: false,
    searxngApiKey: false,
    firecrawlApiKey: false,
    jinaApiKey: false,
    cohereApiKey: false,
  });
  const [validKeysInput, setValidKeysInput] = useState(
    toValidKeysInput(defaultMemoryForm.validKeys),
  );
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

  useEffect(() => {
    const webSearch = settingsQuery.data?.webSearch;
    if (!webSearch) {
      return;
    }

    setWebSearchForm(webSearch);
  }, [settingsQuery.data?.webSearch]);

  useEffect(() => {
    const sensitiveInformationPolicy = settingsQuery.data?.sensitiveInformationPolicy;
    if (!sensitiveInformationPolicy) {
      return;
    }

    setSensitivePolicyForm(sensitiveInformationPolicy);
  }, [settingsQuery.data?.sensitiveInformationPolicy]);

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
        message:
          error instanceof Error ? error.message : localize('com_ui_error_save_admin_settings'),
      });
    }
  };

  const getSensitiveThresholdValue = (
    ruleCode: string,
    action: AdminSensitivePolicyAction,
  ): number | '' => {
    const threshold = sensitivePolicyForm.rules
      .find((rule) => rule.ruleCode === ruleCode)
      ?.thresholds.find((item) => item.action === action);
    return threshold?.minCount ?? '';
  };

  const setSensitiveThresholdValue = (
    ruleCode: string,
    action: AdminSensitivePolicyAction,
    value: string,
  ) => {
    setSensitivePolicyForm((current) => {
      const rules = current.rules.map((rule) => {
        if (rule.ruleCode !== ruleCode) {
          return rule;
        }

        const thresholds = rule.thresholds.filter((threshold) => threshold.action !== action);
        if (value.length > 0) {
          thresholds.push({ action, minCount: Number(value) });
        }

        return {
          ...rule,
          thresholds: thresholds.sort((left, right) => left.minCount - right.minCount),
        };
      });

      return { ...current, rules };
    });
  };

  const saveSensitivePolicySettings = async () => {
    try {
      await updateSensitivePolicyMutation.mutateAsync({
        ...sensitivePolicyForm,
        window: {
          type: 'daily',
          durationDays: Number(sensitivePolicyForm.window.durationDays),
        },
        rules: sensitivePolicyForm.rules.map((rule) => ({
          ...rule,
          thresholds: rule.thresholds.filter((threshold) => Number.isFinite(threshold.minCount)),
        })),
      });
      showToast({
        status: 'success',
        message: localize('com_ui_admin_system_settings_saved'),
      });
    } catch (error) {
      showToast({
        status: 'error',
        message:
          error instanceof Error ? error.message : localize('com_ui_error_save_admin_settings'),
      });
    }
  };

  const saveWebSearchSettings = async () => {
    try {
      await updateWebSearchMutation.mutateAsync({
        ...webSearchForm,
        scraperTimeout: Number(webSearchForm.scraperTimeout),
        safeSearch: Number(webSearchForm.safeSearch) as AdminWebSearchSystemSetting['safeSearch'],
      });
      showToast({
        status: 'success',
        message: localize('com_ui_admin_system_settings_saved'),
      });
    } catch (error) {
      showToast({
        status: 'error',
        message:
          error instanceof Error ? error.message : localize('com_ui_error_save_admin_settings'),
      });
    }
  };

  const toggleWebSearchSecretVisibility = (field: WebSearchSecretField) => {
    setVisibleWebSearchSecrets((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const renderWebSearchSecretInput = ({
    field,
    label,
  }: {
    field: WebSearchSecretField;
    label: string;
  }) => (
    <label className="flex flex-col gap-2 text-sm text-text-secondary">
      {label}
      <div className="flex items-center gap-2">
        <input
          type={visibleWebSearchSecrets[field] ? 'text' : 'password'}
          autoComplete="off"
          value={webSearchForm[field]}
          onChange={(event) =>
            setWebSearchForm((current) => ({ ...current, [field]: event.target.value }))
          }
          className="min-w-0 flex-1 rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
        />
        <button
          type="button"
          className="admin-button-secondary rounded-xl px-3 py-2 text-sm font-medium"
          onClick={() => toggleWebSearchSecretVisibility(field)}
        >
          {visibleWebSearchSecrets[field] ? localize('com_ui_hide') : localize('com_ui_show')}
        </button>
      </div>
    </label>
  );

  const renderWebSearchTextInput = ({
    field,
    label,
    type = 'text',
  }: {
    field: 'searxngInstanceUrl' | 'firecrawlApiUrl' | 'firecrawlVersion' | 'jinaApiUrl';
    label: string;
    type?: 'text' | 'url';
  }) => (
    <label className="flex flex-col gap-2 text-sm text-text-secondary">
      {label}
      <input
        type={type}
        value={webSearchForm[field]}
        onChange={(event) =>
          setWebSearchForm((current) => ({ ...current, [field]: event.target.value }))
        }
        className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
      />
    </label>
  );

  const sectionButtonClassName = (section: SystemSettingSection) =>
    [
      'w-full rounded-2xl border p-4 text-left transition-colors',
      activeSection === section
        ? 'border-border-heavy bg-surface-primary'
        : 'border-border-medium bg-background hover:border-border-heavy',
    ].join(' ');

  const renderMemorySettings = () => (
    <div className="rounded-2xl border border-border-medium bg-background p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">{localize('com_ui_memories')}</h2>
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
                tokenLimit: event.target.value.length === 0 ? null : Number(event.target.value),
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
  );

  const renderSensitivePolicySettings = () => (
    <div className="rounded-2xl border border-border-medium bg-background p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">
          {localize('com_ui_admin_sensitive_information_policy')}
        </h2>
        <button
          type="button"
          className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={saveSensitivePolicySettings}
          disabled={updateSensitivePolicyMutation.isLoading || settingsQuery.isLoading}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_save')}
        </button>
      </div>

      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface-primary px-4 py-3">
            <span className="text-sm font-medium text-text-primary">
              {localize('com_ui_admin_sensitive_policy_enabled')}
            </span>
            <input
              type="checkbox"
              checked={sensitivePolicyForm.enabled}
              onChange={(event) =>
                setSensitivePolicyForm((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
              className="h-4 w-4"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-text-secondary">
            {localize('com_ui_admin_sensitive_policy_window_days')}
            <input
              type="number"
              min={1}
              value={sensitivePolicyForm.window.durationDays}
              onChange={(event) =>
                setSensitivePolicyForm((current) => ({
                  ...current,
                  window: {
                    type: 'daily',
                    durationDays: Number(event.target.value),
                  },
                }))
              }
              className="rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-medium">
          <div className="min-w-[560px]">
            <div
              className={`grid gap-3 bg-surface-primary px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary ${sensitivePolicyGridColumns}`}
            >
              <div>{localize('com_ui_admin_sensitive_rule')}</div>
              <div>{localize('com_ui_admin_sensitive_action_record')}</div>
              <div>{localize('com_ui_admin_sensitive_action_warn')}</div>
              <div>{localize('com_ui_admin_sensitive_action_block')}</div>
            </div>
            {sensitiveRuleCodes.map((ruleCode) => (
              <div
                key={ruleCode}
                className={`grid items-center gap-3 border-t border-border-light px-4 py-3 ${sensitivePolicyGridColumns}`}
              >
                <div className="text-sm font-medium text-text-primary">
                  {localize(
                    sensitiveRuleLocalizationKeys[ruleCode] as Parameters<typeof localize>[0],
                  )}
                </div>
                {sensitiveActions.map((action) => (
                  <input
                    key={action}
                    type="number"
                    min={0}
                    value={getSensitiveThresholdValue(ruleCode, action)}
                    onChange={(event) =>
                      setSensitiveThresholdValue(ruleCode, action, event.target.value)
                    }
                    className="w-full rounded-lg border border-border-medium bg-surface-primary px-2 py-1.5 text-sm text-text-primary"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderWebSearchSettings = () => (
    <div className="rounded-2xl border border-border-medium bg-background p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">{localize('com_ui_web_search')}</h2>
        <button
          type="button"
          className="admin-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          onClick={saveWebSearchSettings}
          disabled={updateWebSearchMutation.isLoading || settingsQuery.isLoading}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_save')}
        </button>
      </div>

      <div className="grid gap-5">
        <section className="grid gap-4 rounded-2xl border border-border-light bg-surface-primary p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_ui_web_search_provider')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_web_search_provider')}
              <select
                value={webSearchForm.searchProvider}
                onChange={(event) =>
                  setWebSearchForm((current) => ({
                    ...current,
                    searchProvider: event.target
                      .value as AdminWebSearchSystemSetting['searchProvider'],
                  }))
                }
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value="serper">{localize('com_ui_web_search_provider_serper')}</option>
                <option value="searxng">{localize('com_ui_web_search_provider_searxng')}</option>
              </select>
            </label>

            {webSearchForm.searchProvider === 'serper' &&
              renderWebSearchSecretInput({
                field: 'serperApiKey',
                label: localize('com_ui_admin_web_search_serper_api_key'),
              })}

            {webSearchForm.searchProvider === 'searxng' && (
              <>
                {renderWebSearchTextInput({
                  field: 'searxngInstanceUrl',
                  label: localize('com_ui_web_search_searxng_instance_url'),
                  type: 'url',
                })}

                {renderWebSearchSecretInput({
                  field: 'searxngApiKey',
                  label: localize('com_ui_admin_web_search_searxng_api_key'),
                })}
              </>
            )}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border-light bg-surface-primary p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_ui_web_search_scraper')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_web_search_scraper')}
              <select
                value={webSearchForm.scraperProvider}
                onChange={(event) =>
                  setWebSearchForm((current) => ({
                    ...current,
                    scraperProvider: event.target
                      .value as AdminWebSearchSystemSetting['scraperProvider'],
                  }))
                }
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value="firecrawl">{localize('com_ui_web_search_scraper_firecrawl')}</option>
                <option value="serper">{localize('com_ui_web_search_scraper_serper')}</option>
              </select>
            </label>

            {webSearchForm.scraperProvider === 'firecrawl' && (
              <>
                {renderWebSearchSecretInput({
                  field: 'firecrawlApiKey',
                  label: localize('com_ui_admin_web_search_firecrawl_api_key'),
                })}

                {renderWebSearchTextInput({
                  field: 'firecrawlApiUrl',
                  label: localize('com_ui_web_search_firecrawl_url'),
                  type: 'url',
                })}

                {renderWebSearchTextInput({
                  field: 'firecrawlVersion',
                  label: localize('com_ui_admin_web_search_firecrawl_version'),
                })}
              </>
            )}

            {webSearchForm.scraperProvider === 'serper' &&
              renderWebSearchSecretInput({
                field: 'serperApiKey',
                label: localize('com_ui_admin_web_search_serper_api_key'),
              })}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border-light bg-surface-primary p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_ui_web_search_reranker')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_web_search_reranker')}
              <select
                value={webSearchForm.rerankerType}
                onChange={(event) =>
                  setWebSearchForm((current) => ({
                    ...current,
                    rerankerType: event.target.value as AdminWebSearchSystemSetting['rerankerType'],
                  }))
                }
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value="jina">{localize('com_ui_web_search_reranker_jina')}</option>
                <option value="cohere">{localize('com_ui_web_search_reranker_cohere')}</option>
              </select>
            </label>

            {webSearchForm.rerankerType === 'jina' && (
              <>
                {renderWebSearchSecretInput({
                  field: 'jinaApiKey',
                  label: localize('com_ui_admin_web_search_jina_api_key'),
                })}

                {renderWebSearchTextInput({
                  field: 'jinaApiUrl',
                  label: localize('com_ui_web_search_jina_url'),
                  type: 'url',
                })}
              </>
            )}

            {webSearchForm.rerankerType === 'cohere' &&
              renderWebSearchSecretInput({
                field: 'cohereApiKey',
                label: localize('com_ui_admin_web_search_cohere_api_key'),
              })}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl border border-border-light bg-surface-primary p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_ui_admin_web_search_common_settings')}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_web_search_scraper_timeout')}
              <input
                type="number"
                min={1}
                value={webSearchForm.scraperTimeout}
                onChange={(event) =>
                  setWebSearchForm((current) => ({
                    ...current,
                    scraperTimeout: Number(event.target.value),
                  }))
                }
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              {localize('com_ui_admin_web_search_safe_search')}
              <select
                value={webSearchForm.safeSearch}
                onChange={(event) =>
                  setWebSearchForm((current) => ({
                    ...current,
                    safeSearch: Number(
                      event.target.value,
                    ) as AdminWebSearchSystemSetting['safeSearch'],
                  }))
                }
                className="rounded-xl border border-border-medium bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value={0}>{localize('com_ui_admin_web_search_safe_search_off')}</option>
                <option value={1}>
                  {localize('com_ui_admin_web_search_safe_search_moderate')}
                </option>
                <option value={2}>{localize('com_ui_admin_web_search_safe_search_strict')}</option>
              </select>
            </label>
          </div>
        </section>
      </div>
    </div>
  );

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
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-border-medium bg-surface-primary p-5">
          {settingsQuery.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-auto pr-1">
                <div className="flex flex-col gap-4">
                  <button
                    type="button"
                    className={sectionButtonClassName('memory')}
                    onClick={() => setActiveSection('memory')}
                    aria-pressed={activeSection === 'memory'}
                  >
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
                  </button>

                  <button
                    type="button"
                    className={sectionButtonClassName('webSearch')}
                    onClick={() => setActiveSection('webSearch')}
                    aria-pressed={activeSection === 'webSearch'}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-primary text-text-primary">
                        <Globe className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {localize('com_ui_web_search')}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {webSearchForm.searchProvider} / {webSearchForm.scraperProvider}
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={sectionButtonClassName('sensitivePolicy')}
                    onClick={() => setActiveSection('sensitivePolicy')}
                    aria-pressed={activeSection === 'sensitivePolicy'}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-primary text-text-primary">
                        <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {localize('com_ui_admin_sensitive_information_policy')}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {sensitivePolicyForm.enabled
                            ? localize('com_ui_admin_enabled')
                            : localize('com_ui_admin_disabled')}
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="min-h-0 min-w-0 overflow-auto pr-1">
                {activeSection === 'memory' && renderMemorySettings()}
                {activeSection === 'webSearch' && renderWebSearchSettings()}
                {activeSection === 'sensitivePolicy' && renderSensitivePolicySettings()}
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
