import type { AppConfig } from '@librechat/data-schemas';
import { logger } from '@librechat/data-schemas';
import type {
  AdminChannelInventoryResponse,
  AdminChannelPricingOverride,
  TEndpoint,
  TEndpointsConfig,
  TModelsConfig,
} from 'librechat-data-provider';
import {
  EModelEndpoint,
  KnownEndpoints,
  defaultModels,
  envVarRegex,
  extractEnvVariable,
  initialModelsConfig,
  mapModelToAzureConfig,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getCustomEndpointConfig } from '~/app/config';
import { fetchModels } from '~/endpoints/models';
import { isUserProvided } from '~/utils';

type AdminChannelInventoryLoaders = {
  getAppConfig: (options?: { role?: string }) => Promise<AppConfig>;
  getEndpointsConfig: (req: Request) => Promise<TEndpointsConfig>;
  getModelsConfig: (req: Request) => Promise<TModelsConfig>;
  fetchCustomEndpointModels?: typeof fetchModels;
};

type AdminChannelInventoryItem = AdminChannelInventoryResponse['inventory'][number];
type RequestWithOptionalUserId = Request & {
  user?: {
    id?: string;
  };
};

type TokenRateMap = Record<string, { prompt?: number; completion?: number }>;
type CacheRateMap = Record<string, { write?: number; read?: number }>;
type GetValueKey = (model: string, endpoint?: string) => string | undefined;
type PricingModule = {
  tokenValues: TokenRateMap;
  cacheTokenValues: CacheRateMap;
  getValueKey: GetValueKey;
};

let pricingModule: PricingModule | null = null;

const builtinInventoryEndpoints = [
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.openAI,
  EModelEndpoint.google,
  EModelEndpoint.anthropic,
  EModelEndpoint.bedrock,
] as const;

function createInventoryLabel(endpoint: string, model: string): string {
  return `${endpoint} / ${model}`;
}

function getPricingModule(): PricingModule {
  if (pricingModule != null) {
    return pricingModule;
  }

  const pricingModulePath = [
    resolve(__dirname, '../../../api/models/tx.js'),
    resolve(__dirname, '../../../../api/models/tx.js'),
    resolve(process.cwd(), 'api/models/tx.js'),
  ].find((candidate) => existsSync(candidate));

  if (pricingModulePath == null) {
    throw new Error('Unable to resolve pricing module path for admin channel inventory');
  }

  pricingModule = require(pricingModulePath) as PricingModule;
  return pricingModule;
}

function normalizeModelName(model: string): string | null {
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getValidatedAzureConfig(appConfig?: AppConfig) {
  const azureConfig = appConfig?.endpoints?.[EModelEndpoint.azureOpenAI];
  if (azureConfig == null || typeof azureConfig !== 'object') {
    return null;
  }

  if (
    ('groupMap' in azureConfig) !== true ||
    ('modelGroupMap' in azureConfig) !== true ||
    typeof azureConfig.groupMap !== 'object' ||
    azureConfig.groupMap == null ||
    typeof azureConfig.modelGroupMap !== 'object' ||
    azureConfig.modelGroupMap == null
  ) {
    return null;
  }

  return azureConfig;
}

function isUsableAzureModel(modelName: string, appConfig?: AppConfig): boolean {
  const azureConfig = getValidatedAzureConfig(appConfig);
  if (azureConfig == null) {
    return false;
  }

  try {
    mapModelToAzureConfig({
      modelName,
      modelGroupMap: azureConfig.modelGroupMap,
      groupMap: azureConfig.groupMap,
    });
    return true;
  } catch {
    return false;
  }
}

function isUserProvidedEndpoint(endpoint: string, endpointsConfig: TEndpointsConfig): boolean {
  if (endpointsConfig == null) {
    return false;
  }

  const endpointConfig = endpointsConfig[endpoint];
  return (
    endpointConfig != null &&
    typeof endpointConfig === 'object' &&
    endpointConfig.userProvide === true
  );
}

function hasResolvedServerValue(value?: string): boolean {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const resolvedValue = extractEnvVariable(value).trim();
  if (resolvedValue.length === 0) {
    return false;
  }

  if (envVarRegex.test(resolvedValue)) {
    return false;
  }

  return isUserProvided(resolvedValue) !== true;
}

function hasResolvedServerHeaders(headers?: Record<string, string>): boolean {
  if (headers == null) {
    return true;
  }

  return Object.values(headers).every((value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return false;
    }

    const resolvedValue = extractEnvVariable(value).trim();
    if (resolvedValue.length === 0) {
      return false;
    }

    return !/\${[^}]+}/.test(resolvedValue) && isUserProvided(resolvedValue) !== true;
  });
}

function isUsableCustomEndpoint(endpoint: string, appConfig?: AppConfig): boolean {
  const customEndpoint = getCustomEndpointConfig({
    endpoint,
    appConfig,
  });
  if (customEndpoint == null) {
    return false;
  }

  const hasModels =
    customEndpoint.models?.fetch === true ||
    (Array.isArray(customEndpoint.models?.default) && customEndpoint.models.default.length > 0);

  return (
    hasModels &&
    hasResolvedServerValue(customEndpoint.apiKey) &&
    hasResolvedServerValue(customEndpoint.baseURL) &&
    hasResolvedServerHeaders(customEndpoint.headers)
  );
}

function isUsableInventoryItem(endpoint: string, modelName: string, appConfig?: AppConfig): boolean {
  if (endpoint === EModelEndpoint.azureOpenAI && appConfig?.endpoints?.[EModelEndpoint.azureOpenAI]) {
    return isUsableAzureModel(modelName, appConfig);
  }

  if (!(endpoint in EModelEndpoint)) {
    return isUsableCustomEndpoint(endpoint, appConfig);
  }

  return true;
}

function getDefaultRates(
  endpoint: string,
  model: string,
): AdminChannelPricingOverride | null {
  const { tokenValues, cacheTokenValues, getValueKey } = getPricingModule();
  const valueKey = getValueKey(model, endpoint);
  if (valueKey == null) {
    return null;
  }

  const tokenRate = tokenValues[valueKey] ?? {};
  const cacheRate = cacheTokenValues[valueKey] ?? {};
  const defaultRates: AdminChannelPricingOverride = {
    prompt: tokenRate.prompt ?? null,
    completion: tokenRate.completion ?? null,
    write: cacheRate.write ?? null,
    read: cacheRate.read ?? null,
  };

  if (Object.values(defaultRates).every((value) => value == null)) {
    return null;
  }

  return defaultRates;
}

function createInventoryItem(
  endpoint: string,
  model: string,
  source: AdminChannelInventoryItem['source'],
): AdminChannelInventoryItem {
  return {
    endpoint,
    model,
    label: createInventoryLabel(endpoint, model),
    source,
    defaultRates: getDefaultRates(endpoint, model),
    defaultParameters: null,
  };
}

function sortInventoryItems(
  inventory: AdminChannelInventoryItem[],
): AdminChannelInventoryResponse['inventory'] {
  return inventory.sort((left, right) => {
    const endpointComparison = left.endpoint.localeCompare(right.endpoint);
    if (endpointComparison !== 0) {
      return endpointComparison;
    }

    return left.model.localeCompare(right.model);
  });
}

function getBuiltinInventoryModels(): Array<[string, string[]]> {
  return builtinInventoryEndpoints.map((endpoint) => {
    if (endpoint === EModelEndpoint.azureOpenAI) {
      return [endpoint, initialModelsConfig[EModelEndpoint.azureOpenAI] ?? []];
    }

    return [endpoint, defaultModels[endpoint] ?? []];
  });
}

export function filterModelsConfigToUsableEntries(
  endpointsConfig: TEndpointsConfig,
  modelsConfig: TModelsConfig,
  appConfig?: AppConfig,
): TModelsConfig {
  if (endpointsConfig == null) {
    return {};
  }

  return (Object.entries(modelsConfig) as Array<[string, string[]]>).reduce<TModelsConfig>(
    (filtered, [endpoint, models]) => {
      if (endpointsConfig[endpoint] == null) {
        return filtered;
      }

      if (isUserProvidedEndpoint(endpoint, endpointsConfig)) {
        return filtered;
      }

      const usableModels: string[] = [];
      const seenModels = new Set<string>();

      for (const model of models) {
        const normalizedModel = normalizeModelName(model);
        if (normalizedModel == null) {
          continue;
        }

        if (isUsableInventoryItem(endpoint, normalizedModel, appConfig) !== true) {
          continue;
        }

        if (seenModels.has(normalizedModel)) {
          continue;
        }

        seenModels.add(normalizedModel);
        usableModels.push(normalizedModel);
      }

      if (usableModels.length > 0) {
        filtered[endpoint] = usableModels.sort((left, right) => left.localeCompare(right));
      }

      return filtered;
    },
    {},
  );
}

export function buildAdminChannelInventory(
  endpointsConfig: TEndpointsConfig,
  modelsConfig: TModelsConfig,
  appConfig?: AppConfig,
): AdminChannelInventoryResponse {
  const filteredModelsConfig =
    endpointsConfig == null ? {} : filterModelsConfigToUsableEntries(endpointsConfig, modelsConfig, appConfig);

  const inventoryMap = new Map<string, AdminChannelInventoryItem>();

  const addInventoryEntries = (
    entries: Array<[string, string[]]>,
    source: AdminChannelInventoryItem['source'],
  ) => {
    for (const [endpoint, models] of entries) {
      for (const model of models) {
        const normalizedModel = normalizeModelName(model);
        if (normalizedModel == null) {
          continue;
        }

        const key = `${endpoint}::${normalizedModel}`;
        if (inventoryMap.has(key)) {
          continue;
        }

        inventoryMap.set(key, createInventoryItem(endpoint, normalizedModel, source));
      }
    }
  };

  addInventoryEntries(Object.entries(filteredModelsConfig) as Array<[string, string[]]>, 'runtime');
  addInventoryEntries(getBuiltinInventoryModels(), 'builtin');

  return {
    inventory: sortInventoryItems(Array.from(inventoryMap.values())),
  };
}

type FetchableCustomInventorySource = {
  endpoint: string;
  apiKey: string;
  baseURL: string;
  direct: boolean;
  userIdQuery: boolean;
  headers?: TEndpoint['headers'];
};

function getFetchableCustomInventorySources(
  appConfig?: AppConfig,
): FetchableCustomInventorySource[] {
  const customEndpoints = (appConfig?.endpoints as { custom?: TEndpoint[] } | undefined)?.custom;
  if (!Array.isArray(customEndpoints)) {
    return [];
  }

  return customEndpoints.reduce<FetchableCustomInventorySource[]>((sources, endpoint) => {
    const endpointName = normalizeEndpointName(endpoint.name ?? '');
    if (!endpointName.startsWith(KnownEndpoints.ollama) || endpoint.models?.fetch !== true) {
      return sources;
    }

    const apiKey = extractEnvVariable(endpoint.apiKey ?? '').trim();
    const baseURL = extractEnvVariable(endpoint.baseURL ?? '').trim();
    if (
      apiKey.length === 0 ||
      baseURL.length === 0 ||
      envVarRegex.test(apiKey) ||
      envVarRegex.test(baseURL) ||
      isUserProvided(apiKey) ||
      isUserProvided(baseURL)
    ) {
      return sources;
    }

    sources.push({
      endpoint: endpointName,
      apiKey,
      baseURL,
      direct: endpoint.directEndpoint === true,
      userIdQuery: endpoint.models?.userIdQuery === true,
      headers: endpoint.headers,
    });
    return sources;
  }, []);
}

async function getFetchedCustomInventoryItems(
  req: RequestWithOptionalUserId,
  appConfig: AppConfig | undefined,
  fetchCustomEndpointModels: typeof fetchModels,
): Promise<AdminChannelInventoryItem[]> {
  const sources = getFetchableCustomInventorySources(appConfig);
  if (sources.length === 0) {
    return [];
  }

  const results = await Promise.all(
    sources.map(async (source) => {
      const models = await fetchCustomEndpointModels({
        name: source.endpoint,
        apiKey: source.apiKey,
        baseURL: source.baseURL,
        user: req.user?.id,
        userObject: req.user,
        headers: source.headers ?? undefined,
        direct: source.direct,
        userIdQuery: source.userIdQuery,
      });

      return models.map((model) => createInventoryItem(source.endpoint, model, 'runtime'));
    }),
  );

  return results.flat();
}

export function createGetAdminChannelInventory({
  getAppConfig,
  getEndpointsConfig,
  getModelsConfig,
  fetchCustomEndpointModels = fetchModels,
}: AdminChannelInventoryLoaders) {
  return async function getAdminChannelInventory(req: Request, res: Response) {
    try {
      const request = req as RequestWithOptionalUserId;
      const [appConfig, endpointsConfig, modelsConfig] = await Promise.all([
        getAppConfig(),
        getEndpointsConfig(request),
        getModelsConfig(request),
      ]);
      const inventory = buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig);
      const fetchedCustomInventory = await getFetchedCustomInventoryItems(
        request,
        appConfig,
        fetchCustomEndpointModels,
      );
      const inventoryMap = new Map(
        inventory.inventory.map((item) => [`${item.endpoint}::${item.model}`, item]),
      );

      for (const item of fetchedCustomInventory) {
        const key = `${item.endpoint}::${item.model}`;
        if (!inventoryMap.has(key)) {
          inventoryMap.set(key, item);
        }
      }

      return res.status(200).json({
        inventory: sortInventoryItems(Array.from(inventoryMap.values())),
      });
    } catch (error) {
      logger.error('[getAdminChannelInventory]', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load admin channel inventory';
      return res.status(500).json({ message });
    }
  };
}
