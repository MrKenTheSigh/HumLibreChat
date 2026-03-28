import mongoose from 'mongoose';
import { createModels, logger } from '@librechat/data-schemas';
import { EModelEndpoint, extractEnvVariable } from 'librechat-data-provider';
import type {
  TAnthropicEndpoint,
  TAzureGroup,
  TBaseEndpoint,
  TCustomConfig,
  TCustomEndpoints,
  TEndpoint,
} from 'librechat-data-provider';
import type { EndpointTokenConfig, TokenConfig } from '~/types';
import { getModelMaxTokens } from '~/utils/tokens';
import { isUserProvided } from '~/utils';
import { normalizeAdminChannelDocument, type RawAdminChannelDocument } from './channelDomain';

const { AdminChannel } = createModels(mongoose);
const OLLAMA_DEFAULT_API_KEY = 'ollama';


type ManagedChannelRuntimeRecord = RawAdminChannelDocument & {
  _id: mongoose.Types.ObjectId | string;
};

type ManagedRuntimeLoaders = {
  getEnabledChannels: () => Promise<ManagedChannelRuntimeRecord[]>;
};

type ManagedCustomEndpoint = TEndpoint & {
  tokenConfig?: EndpointTokenConfig;
  configuredModelsOnly?: boolean;
};
type ManagedAzureModelConfig = { deploymentName: string };

type ManagedAzureEndpointOverlay = {
  groups: TAzureGroup[];
} & Omit<NonNullable<NonNullable<TCustomConfig['endpoints']>['azureOpenAI']>, 'groups'>;
type ManagedBedrockEndpoint = NonNullable<NonNullable<TCustomConfig['endpoints']>['bedrock']>;
type ManagedAnthropicEndpoint = TAnthropicEndpoint & {
  vertexConfig?: {
    enabled?: boolean;
  };
};

type ManagedStandardEndpoint =
  | TBaseEndpoint
  | ManagedAnthropicEndpoint
  | ManagedBedrockEndpoint;

function createDefaultLoaders(): ManagedRuntimeLoaders {
  return {
    getEnabledChannels: async () =>
      AdminChannel.find({ enabled: true })
        .select('_id name slug providerType description enabled sortOrder connection secrets models entries')
        .sort({ sortOrder: 1, name: 1, _id: 1 })
        .lean<ManagedChannelRuntimeRecord[]>(),
  };
}

function toHeaderRecord(headers: Array<{ key: string; value: string }>): Record<string, string> | undefined {
  const normalized = headers.reduce<Record<string, string>>((record, header) => {
    if (header.key.length === 0 || header.value.length === 0) {
      return record;
    }

    record[header.key] = header.value;
    return record;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function collectExistingCustomRuntimeEndpoints(config: Partial<TCustomConfig>): Set<string> {
  return new Set(
    (config.endpoints?.[EModelEndpoint.custom] ?? [])
      .map((endpoint) => endpoint.name?.trim())
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );
}

function collectExistingAzureGroupNames(config: Partial<TCustomConfig>): Set<string> {
  return new Set(
    (config.endpoints?.[EModelEndpoint.azureOpenAI]?.groups ?? [])
      .map((group) => group.group?.trim())
      .filter((name): name is string => typeof name === 'string' && name.length > 0),
  );
}

function collectExistingAzureModelNames(config: Partial<TCustomConfig>): Set<string> {
  const existing = new Set<string>();
  for (const group of config.endpoints?.[EModelEndpoint.azureOpenAI]?.groups ?? []) {
    for (const modelName of Object.keys(group.models ?? {})) {
      if (modelName.trim().length > 0) {
        existing.add(modelName);
      }
    }
  }

  return existing;
}

function hasResolvedServerValue(value?: string): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const resolvedValue = extractEnvVariable(value).trim();
  if (resolvedValue.length === 0) {
    return false;
  }

  return !/\${[^}]+}/.test(resolvedValue) && isUserProvided(resolvedValue) !== true;
}

function isBootstrapStandardProviderConfigured(
  provider: EModelEndpoint.openAI | EModelEndpoint.google | EModelEndpoint.anthropic | EModelEndpoint.bedrock,
  config: Partial<TCustomConfig>,
): boolean {
  const endpointConfig = config.endpoints?.[provider];
  if (endpointConfig == null || typeof endpointConfig !== 'object') {
    return false;
  }

  if (provider === EModelEndpoint.openAI || provider === EModelEndpoint.google) {
    return hasResolvedServerValue((endpointConfig as TBaseEndpoint).apiKey);
  }

  if (provider === EModelEndpoint.anthropic) {
    const anthropicConfig = endpointConfig as ManagedAnthropicEndpoint;
    return anthropicConfig.vertexConfig?.enabled === true || hasResolvedServerValue(anthropicConfig.apiKey);
  }

  const bedrockConfig = endpointConfig as ManagedBedrockEndpoint;
  return (
    hasResolvedServerValue(bedrockConfig.region) ||
    hasResolvedServerValue(bedrockConfig.accessKeyId) ||
    hasResolvedServerValue(bedrockConfig.secretAccessKey)
  );
}

function buildManagedCustomTokenConfig(
  channel: ReturnType<typeof normalizeAdminChannelDocument>,
): EndpointTokenConfig | undefined {
  const tokenConfig = channel.models.reduce<EndpointTokenConfig>((record, model) => {
    if (model.enabled !== true || model.pricingOverride == null) {
      return record;
    }

    const context = getModelMaxTokens(model.model, EModelEndpoint.custom);
    const tokenEntry: TokenConfig = {
      ...(typeof context === 'number' && { context }),
      ...(typeof model.pricingOverride.prompt === 'number' && { prompt: model.pricingOverride.prompt }),
      ...(typeof model.pricingOverride.completion === 'number' && {
        completion: model.pricingOverride.completion,
      }),
      ...(typeof model.pricingOverride.write === 'number' && { write: model.pricingOverride.write }),
      ...(typeof model.pricingOverride.read === 'number' && { read: model.pricingOverride.read }),
    };

    if (Object.keys(tokenEntry).length === 0) {
      return record;
    }

    record[model.model] = tokenEntry;
    return record;
  }, {});

  return Object.keys(tokenConfig).length > 0 ? tokenConfig : undefined;
}

function buildManagedAzureTokenConfig(
  channel: ReturnType<typeof normalizeAdminChannelDocument>,
): EndpointTokenConfig | undefined {
  const tokenConfig = channel.models.reduce<EndpointTokenConfig>((record, model) => {
    if (model.enabled !== true || model.pricingOverride == null) {
      return record;
    }

    const context = getModelMaxTokens(model.model, EModelEndpoint.azureOpenAI);
    const tokenEntry: TokenConfig = {
      ...(typeof context === 'number' && { context }),
      ...(typeof model.pricingOverride.prompt === 'number' && { prompt: model.pricingOverride.prompt }),
      ...(typeof model.pricingOverride.completion === 'number' && {
        completion: model.pricingOverride.completion,
      }),
      ...(typeof model.pricingOverride.write === 'number' && { write: model.pricingOverride.write }),
      ...(typeof model.pricingOverride.read === 'number' && { read: model.pricingOverride.read }),
    };

    if (Object.keys(tokenEntry).length === 0) {
      return record;
    }

    record[model.model] = tokenEntry;
    return record;
  }, {});

  return Object.keys(tokenConfig).length > 0 ? tokenConfig : undefined;
}

function buildManagedStandardTokenConfig(
  channel: ReturnType<typeof normalizeAdminChannelDocument>,
  endpoint: EModelEndpoint.openAI | EModelEndpoint.google | EModelEndpoint.anthropic | EModelEndpoint.bedrock,
): EndpointTokenConfig | undefined {
  const tokenConfig = channel.models.reduce<EndpointTokenConfig>((record, model) => {
    if (model.enabled !== true || model.pricingOverride == null) {
      return record;
    }

    const context = getModelMaxTokens(model.model, endpoint);
    const tokenEntry: TokenConfig = {
      ...(typeof context === 'number' && { context }),
      ...(typeof model.pricingOverride.prompt === 'number' && { prompt: model.pricingOverride.prompt }),
      ...(typeof model.pricingOverride.completion === 'number' && {
        completion: model.pricingOverride.completion,
      }),
      ...(typeof model.pricingOverride.write === 'number' && { write: model.pricingOverride.write }),
      ...(typeof model.pricingOverride.read === 'number' && { read: model.pricingOverride.read }),
    };

    if (Object.keys(tokenEntry).length === 0) {
      return record;
    }

    record[model.model] = tokenEntry;
    return record;
  }, {});

  return Object.keys(tokenConfig).length > 0 ? tokenConfig : undefined;
}

function buildManagedCustomEndpoint(
  channel: ManagedChannelRuntimeRecord,
): ManagedCustomEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'custom') {
    return null;
  }

  const runtimeEndpoint = normalized.connection.runtimeEndpoint.trim();
  const apiKey = normalized.secrets.apiKeyRef || normalized.secrets.apiKey;
  const baseURL = normalized.connection.baseURL.trim();
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);
  const tokenConfig = buildManagedCustomTokenConfig(normalized);

  if (runtimeEndpoint.length === 0 || apiKey.trim().length === 0 || baseURL.length === 0 || models.length === 0) {
    return null;
  }

  return {
    name: runtimeEndpoint,
    apiKey,
    baseURL,
    models: {
      default: models,
      fetch: normalized.connection.modelFetch,
    },
    ...(toHeaderRecord(normalized.connection.headers) && {
      headers: toHeaderRecord(normalized.connection.headers),
    }),
    ...(tokenConfig && { tokenConfig }),
    ...(normalized.sortOrder !== 0 && { customOrder: normalized.sortOrder }),
  };
}

function ensureOllamaBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '');
  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function buildManagedOllamaEndpoint(
  channel: ManagedChannelRuntimeRecord,
): ManagedCustomEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'ollama') {
    return null;
  }

  const baseURL = ensureOllamaBaseURL(normalized.connection.baseURL);
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);
  const tokenConfig = buildManagedCustomTokenConfig(normalized);

  if (baseURL.length === 0 || models.length === 0) {
    return null;
  }

  return {
    name: 'ollama',
    apiKey: OLLAMA_DEFAULT_API_KEY,
    baseURL,
    configuredModelsOnly: true,
    models: {
      default: models,
      fetch: normalized.connection.modelFetch,
    },
    ...(toHeaderRecord(normalized.connection.headers) && {
      headers: toHeaderRecord(normalized.connection.headers),
    }),
    ...(tokenConfig && { tokenConfig }),
    ...(normalized.sortOrder !== 0 && { customOrder: normalized.sortOrder }),
  };
}

function buildManagedAzureGroup(channel: ManagedChannelRuntimeRecord): TAzureGroup | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'azureOpenAI') {
    return null;
  }

  const apiKey = normalized.secrets.apiKeyRef || normalized.secrets.apiKey;
  const instanceName = normalized.connection.instanceName.trim();
  const version = normalized.connection.apiVersion.trim();
  const tokenConfig = buildManagedAzureTokenConfig(normalized);
  const models = normalized.models.reduce<Record<string, { deploymentName: string }>>((record, model) => {
    if (model.enabled !== true || model.model.trim().length === 0 || model.deploymentName.trim().length === 0) {
      return record;
    }

    record[model.model] = {
      deploymentName: model.deploymentName.trim(),
    };
    return record;
  }, {});

  if (
    normalized.slug.trim().length === 0 ||
    apiKey.trim().length === 0 ||
    instanceName.length === 0 ||
    version.length === 0 ||
    Object.keys(models).length === 0
  ) {
    return null;
  }

  return {
    group: normalized.slug,
    apiKey,
    instanceName,
    version,
    models,
    ...(tokenConfig && { tokenConfig }),
    ...(toHeaderRecord(normalized.connection.headers) && {
      additionalHeaders: toHeaderRecord(normalized.connection.headers),
    }),
  };
}

function isManagedAzureModelConfig(
  modelConfig: TAzureGroup['models'][string],
): modelConfig is ManagedAzureModelConfig {
  return typeof modelConfig === 'object' && modelConfig !== null && typeof modelConfig.deploymentName === 'string';
}

function buildManagedOpenAIEndpoint(
  channel: ManagedChannelRuntimeRecord,
): TBaseEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'openAI') {
    return null;
  }

  const apiKey = normalized.secrets.apiKeyRef || normalized.secrets.apiKey;
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);
  if (apiKey.trim().length === 0 || models.length === 0) {
    return null;
  }

  return {
    apiKey,
    ...(normalized.connection.baseURL.trim().length > 0 && { baseURL: normalized.connection.baseURL.trim() }),
    models,
    ...(buildManagedStandardTokenConfig(normalized, EModelEndpoint.openAI) && {
      tokenConfig: buildManagedStandardTokenConfig(normalized, EModelEndpoint.openAI),
    }),
  };
}

function buildManagedGoogleEndpoint(
  channel: ManagedChannelRuntimeRecord,
): TBaseEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'google') {
    return null;
  }

  const apiKey = normalized.secrets.apiKeyRef || normalized.secrets.apiKey;
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);
  if (apiKey.trim().length === 0 || models.length === 0) {
    return null;
  }

  return {
    apiKey,
    ...(normalized.connection.baseURL.trim().length > 0 && { baseURL: normalized.connection.baseURL.trim() }),
    models,
    ...(buildManagedStandardTokenConfig(normalized, EModelEndpoint.google) && {
      tokenConfig: buildManagedStandardTokenConfig(normalized, EModelEndpoint.google),
    }),
  };
}

function buildManagedAnthropicEndpoint(
  channel: ManagedChannelRuntimeRecord,
): ManagedAnthropicEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'anthropic') {
    return null;
  }

  const apiKey = normalized.secrets.apiKeyRef || normalized.secrets.apiKey;
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);
  if (apiKey.trim().length === 0 || models.length === 0) {
    return null;
  }

  return {
    apiKey,
    ...(normalized.connection.baseURL.trim().length > 0 && { baseURL: normalized.connection.baseURL.trim() }),
    models,
    ...(buildManagedStandardTokenConfig(normalized, EModelEndpoint.anthropic) && {
      tokenConfig: buildManagedStandardTokenConfig(normalized, EModelEndpoint.anthropic),
    }),
  };
}

function buildManagedBedrockEndpoint(
  channel: ManagedChannelRuntimeRecord,
): ManagedBedrockEndpoint | null {
  const normalized = normalizeAdminChannelDocument(channel);
  if (normalized.providerType !== 'bedrock') {
    return null;
  }

  const accessKeyId = normalized.secrets.accessKeyIdRef || normalized.secrets.accessKeyId;
  const secretAccessKey =
    normalized.secrets.secretAccessKeyRef || normalized.secrets.secretAccessKey;
  const sessionToken = normalized.secrets.sessionTokenRef || normalized.secrets.sessionToken;
  const region = normalized.connection.region.trim();
  const models = normalized.models.filter((model) => model.enabled === true).map((model) => model.model);

  if (region.length === 0 || models.length === 0) {
    return null;
  }

  return {
    region,
    ...(accessKeyId.trim().length > 0 && { accessKeyId }),
    ...(secretAccessKey.trim().length > 0 && { secretAccessKey }),
    ...(sessionToken.trim().length > 0 && { sessionToken }),
    models,
    availableRegions: [region],
    ...(buildManagedStandardTokenConfig(normalized, EModelEndpoint.bedrock) && {
      tokenConfig: buildManagedStandardTokenConfig(normalized, EModelEndpoint.bedrock),
    }),
  };
}

export function mergeManagedChannelsIntoConfig(
  baseConfig: Partial<TCustomConfig>,
  channels: ManagedChannelRuntimeRecord[],
): Partial<TCustomConfig> {
  if (channels.length === 0) {
    return baseConfig;
  }

  const existingCustomEndpoints = collectExistingCustomRuntimeEndpoints(baseConfig);
  const existingAzureGroups = collectExistingAzureGroupNames(baseConfig);
  const existingAzureModels = collectExistingAzureModelNames(baseConfig);
  const existingStandardProviders = new Set<EModelEndpoint>([
    ...(isBootstrapStandardProviderConfigured(EModelEndpoint.openAI, baseConfig)
      ? [EModelEndpoint.openAI]
      : []),
    ...(isBootstrapStandardProviderConfigured(EModelEndpoint.google, baseConfig)
      ? [EModelEndpoint.google]
      : []),
    ...(isBootstrapStandardProviderConfigured(EModelEndpoint.anthropic, baseConfig)
      ? [EModelEndpoint.anthropic]
      : []),
    ...(isBootstrapStandardProviderConfigured(EModelEndpoint.bedrock, baseConfig)
      ? [EModelEndpoint.bedrock]
      : []),
  ]);

  const managedCustomEndpoints: ManagedCustomEndpoint[] = [];
  const managedAzureGroups: TAzureGroup[] = [];
  const managedStandardEndpoints = new Map<EModelEndpoint, ManagedStandardEndpoint>();

  for (const channel of channels) {
    const ollamaEndpoint = buildManagedOllamaEndpoint(channel);
    if (ollamaEndpoint) {
      if (existingCustomEndpoints.has(ollamaEndpoint.name)) {
        logger.warn(
          `[managedChannels] Skipping ollama channel "${channel.slug}" because runtime endpoint "${ollamaEndpoint.name}" already exists in bootstrap config or another managed channel.`,
        );
      } else {
        existingCustomEndpoints.add(ollamaEndpoint.name);
        managedCustomEndpoints.push(ollamaEndpoint);
      }
      continue;
    }

    const customEndpoint = buildManagedCustomEndpoint(channel);
    if (customEndpoint) {
      if (existingCustomEndpoints.has(customEndpoint.name)) {
        logger.warn(
          `[managedChannels] Skipping custom channel "${channel.slug}" because runtime endpoint "${customEndpoint.name}" already exists in bootstrap config or another managed channel.`,
        );
      } else {
        existingCustomEndpoints.add(customEndpoint.name);
        managedCustomEndpoints.push(customEndpoint);
      }
      continue;
    }

    const azureGroup = buildManagedAzureGroup(channel);
    if (!azureGroup) {
      const standardBuilders: Array<[EModelEndpoint, ManagedStandardEndpoint | null]> = [
        [EModelEndpoint.openAI, buildManagedOpenAIEndpoint(channel)],
        [EModelEndpoint.google, buildManagedGoogleEndpoint(channel)],
        [EModelEndpoint.anthropic, buildManagedAnthropicEndpoint(channel)],
        [EModelEndpoint.bedrock, buildManagedBedrockEndpoint(channel)],
      ];

      for (const [provider, endpointConfig] of standardBuilders) {
        if (endpointConfig == null) {
          continue;
        }

        if (existingStandardProviders.has(provider) || managedStandardEndpoints.has(provider)) {
          logger.warn(
            `[managedChannels] Skipping ${provider} channel "${channel.slug}" because runtime provider "${provider}" already exists in bootstrap config or another managed channel.`,
          );
        } else {
          existingStandardProviders.add(provider);
          managedStandardEndpoints.set(provider, endpointConfig);
        }
      }
      continue;
    }

    if (existingAzureGroups.has(azureGroup.group)) {
      logger.warn(
        `[managedChannels] Skipping azure channel "${channel.slug}" because group "${azureGroup.group}" already exists in bootstrap config or another managed channel.`,
      );
      continue;
    }

    const filteredModels = Object.entries(azureGroup.models).reduce<Record<string, ManagedAzureModelConfig>>(
      (record, [modelName, modelConfig]) => {
        if (!isManagedAzureModelConfig(modelConfig)) {
          return record;
        }

        if (existingAzureModels.has(modelName)) {
          logger.warn(
            `[managedChannels] Skipping managed Azure model "${modelName}" from channel "${channel.slug}" because it already exists in bootstrap config or another managed channel.`,
          );
          return record;
        }

        existingAzureModels.add(modelName);
        record[modelName] = modelConfig;
        return record;
      },
      {},
    );

    if (Object.keys(filteredModels).length === 0) {
      continue;
    }

    existingAzureGroups.add(azureGroup.group);
    managedAzureGroups.push({
      ...azureGroup,
      models: filteredModels,
    });
  }

  if (
    managedCustomEndpoints.length === 0 &&
    managedAzureGroups.length === 0 &&
    managedStandardEndpoints.size === 0
  ) {
    return baseConfig;
  }

  const endpoints: NonNullable<TCustomConfig['endpoints']> = {
    ...(baseConfig.endpoints ?? {}),
  };

  if (managedCustomEndpoints.length > 0) {
    const existingCustomList = ((endpoints[EModelEndpoint.custom] as TCustomEndpoints | undefined) ?? []);
    endpoints[EModelEndpoint.custom] = [
      ...existingCustomList,
      ...managedCustomEndpoints,
    ];
  }

  if (managedAzureGroups.length > 0) {
    const existingAzureConfig = endpoints[EModelEndpoint.azureOpenAI] ?? {};
    const existingAzureGroupsList = Array.isArray(existingAzureConfig.groups)
      ? (existingAzureConfig.groups as TAzureGroup[])
      : [];
    const mergedAzureConfig: ManagedAzureEndpointOverlay = {
      ...(existingAzureConfig as ManagedAzureEndpointOverlay),
      groups: [...existingAzureGroupsList, ...managedAzureGroups],
    };
    endpoints[EModelEndpoint.azureOpenAI] = mergedAzureConfig;
  }

  for (const [provider, endpointConfig] of managedStandardEndpoints.entries()) {
    if (provider === EModelEndpoint.openAI) {
      endpoints[EModelEndpoint.openAI] = endpointConfig as TBaseEndpoint;
      continue;
    }

    if (provider === EModelEndpoint.google) {
      endpoints[EModelEndpoint.google] = endpointConfig as TBaseEndpoint;
      continue;
    }

    if (provider === EModelEndpoint.anthropic) {
      endpoints[EModelEndpoint.anthropic] = endpointConfig as ManagedAnthropicEndpoint;
      continue;
    }

    endpoints[EModelEndpoint.bedrock] = endpointConfig as ManagedBedrockEndpoint;
  }

  return {
    ...baseConfig,
    endpoints,
  };
}

export function createLoadManagedChannelsIntoConfig(
  loaders: ManagedRuntimeLoaders = createDefaultLoaders(),
) {
  return async function loadManagedChannelsIntoConfig(
    baseConfig: Partial<TCustomConfig>,
  ): Promise<Partial<TCustomConfig>> {
    const channels = await loaders.getEnabledChannels();
    return mergeManagedChannelsIntoConfig(baseConfig, channels);
  };
}

export const loadManagedChannelsIntoConfig = createLoadManagedChannelsIntoConfig();
