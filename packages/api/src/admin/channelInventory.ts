import type { AppConfig } from '@librechat/data-schemas';
import { logger } from '@librechat/data-schemas';
import type {
  AdminChannelInventoryResponse,
  TEndpointsConfig,
  TModelsConfig,
} from 'librechat-data-provider';
import {
  EModelEndpoint,
  envVarRegex,
  extractEnvVariable,
  mapModelToAzureConfig,
} from 'librechat-data-provider';
import type { Request, Response } from 'express';
import { getCustomEndpointConfig } from '~/app/config';
import { isUserProvided } from '~/utils';

type AdminChannelInventoryLoaders = {
  getAppConfig: (options?: { role?: string }) => Promise<AppConfig>;
  getEndpointsConfig: (req: Request) => Promise<TEndpointsConfig>;
  getModelsConfig: (req: Request) => Promise<TModelsConfig>;
};

type AdminChannelInventoryItem = AdminChannelInventoryResponse['inventory'][number];

function createInventoryLabel(endpoint: string, model: string): string {
  return `${endpoint} / ${model}`;
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
  const filteredModelsConfig = filterModelsConfigToUsableEntries(
    endpointsConfig,
    modelsConfig,
    appConfig,
  );

  const inventoryMap = (Object.entries(filteredModelsConfig) as Array<[string, string[]]>).reduce<
    Map<string, AdminChannelInventoryItem>
  >((map, [endpoint, models]) => {
    for (const model of models) {
      const key = `${endpoint}::${model}`;
      if (map.has(key)) {
        continue;
      }

      map.set(key, {
        endpoint,
        model,
        label: createInventoryLabel(endpoint, model),
        defaultParameters: null,
      });
    }

    return map;
  }, new Map<string, AdminChannelInventoryItem>());

  return {
    inventory: Array.from(inventoryMap.values()).sort((left, right) => {
      const endpointComparison = left.endpoint.localeCompare(right.endpoint);
      if (endpointComparison !== 0) {
        return endpointComparison;
      }

      return left.model.localeCompare(right.model);
    }),
  };
}

export function createGetAdminChannelInventory({
  getAppConfig,
  getEndpointsConfig,
  getModelsConfig,
}: AdminChannelInventoryLoaders) {
  return async function getAdminChannelInventory(req: Request, res: Response) {
    try {
      const [appConfig, endpointsConfig, modelsConfig] = await Promise.all([
        getAppConfig(),
        getEndpointsConfig(req),
        getModelsConfig(req),
      ]);

      return res.status(200).json(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig));
    } catch (error) {
      logger.error('[getAdminChannelInventory]', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load admin channel inventory';
      return res.status(500).json({ message });
    }
  };
}
