import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TModelsConfig, UserEntitlementsResponse } from 'librechat-data-provider';

type EntitlementLookup = {
  isRestricted: boolean;
  allowedEndpoints: Set<string>;
  allowedModelsByEndpoint: Map<string, Set<string>>;
};

type AllowedSelectionParams = {
  preferredEndpoint?: string | null;
  endpoints: string[];
  modelsConfig: TModelsConfig | undefined;
  entitlements: UserEntitlementsResponse | undefined;
};

export function createEntitlementLookup(
  entitlements: UserEntitlementsResponse | undefined,
): EntitlementLookup {
  const allowedEndpoints = new Set<string>();
  const allowedModelsByEndpoint = new Map<string, Set<string>>();

  if (entitlements?.isRestricted !== true) {
    return {
      isRestricted: false,
      allowedEndpoints,
      allowedModelsByEndpoint,
    };
  }

  for (const pair of entitlements.allowedPairs) {
    allowedEndpoints.add(pair.endpoint);
    const models = allowedModelsByEndpoint.get(pair.endpoint) ?? new Set<string>();
    models.add(pair.model);
    allowedModelsByEndpoint.set(pair.endpoint, models);
  }

  return {
    isRestricted: true,
    allowedEndpoints,
    allowedModelsByEndpoint,
  };
}

export function filterEndpointModels(
  endpoint: string,
  models: string[],
  entitlements: UserEntitlementsResponse | undefined,
): string[] {
  const lookup = createEntitlementLookup(entitlements);
  if (lookup.isRestricted !== true) {
    return models;
  }

  const allowedModels = lookup.allowedModelsByEndpoint.get(endpoint);
  if (allowedModels == null) {
    return [];
  }

  return models.filter((model) => allowedModels.has(model));
}

export function isEndpointVisible(
  endpoint: string,
  entitlements: UserEntitlementsResponse | undefined,
): boolean {
  const lookup = createEntitlementLookup(entitlements);
  if (lookup.isRestricted !== true) {
    return true;
  }

  return lookup.allowedEndpoints.has(endpoint);
}

export function isModelSpecVisible(
  spec: TModelSpec,
  entitlements: UserEntitlementsResponse | undefined,
): boolean {
  if (entitlements?.isRestricted !== true) {
    return true;
  }

  const endpoint = spec.preset.endpoint ?? '';
  const model = spec.preset.model ?? '';
  if (endpoint.length === 0) {
    return true;
  }

  if (isAgentsEndpoint(endpoint) || isAssistantsEndpoint(endpoint)) {
    return true;
  }

  if (model.length === 0) {
    return isEndpointVisible(endpoint, entitlements);
  }

  return filterEndpointModels(endpoint, [model], entitlements).length > 0;
}

export function filterModelSpecs(
  specs: TModelSpec[],
  entitlements: UserEntitlementsResponse | undefined,
): TModelSpec[] {
  if (entitlements?.isRestricted !== true) {
    return specs;
  }

  return specs.filter((spec) => isModelSpecVisible(spec, entitlements));
}

export function getAllowedEndpointSelection({
  preferredEndpoint,
  endpoints,
  modelsConfig,
  entitlements,
}: AllowedSelectionParams): { endpoint: string; models: string[] } | null {
  const getModelsForEndpoint = (endpoint: string): string[] => {
    if (isAgentsEndpoint(endpoint) || isAssistantsEndpoint(endpoint)) {
      return modelsConfig?.[endpoint] ?? [];
    }

    if (entitlements?.isRestricted === true) {
      return filterEndpointModels(endpoint, modelsConfig?.[endpoint] ?? [], entitlements);
    }

    return modelsConfig?.[endpoint] ?? [];
  };

  if (preferredEndpoint != null && preferredEndpoint.length > 0) {
    if (
      (isAgentsEndpoint(preferredEndpoint) || isAssistantsEndpoint(preferredEndpoint)) &&
      (entitlements?.isRestricted !== true || isEndpointVisible(preferredEndpoint, entitlements))
    ) {
      return {
        endpoint: preferredEndpoint,
        models: getModelsForEndpoint(preferredEndpoint),
      };
    }

    const preferredModels = getModelsForEndpoint(preferredEndpoint);
    if (
      preferredModels.length > 0 &&
      (entitlements?.isRestricted !== true || isEndpointVisible(preferredEndpoint, entitlements))
    ) {
      return {
        endpoint: preferredEndpoint,
        models: preferredModels,
      };
    }
  }

  const lookup = createEntitlementLookup(entitlements);
  for (const endpoint of endpoints) {
    if (lookup.isRestricted === true && lookup.allowedEndpoints.has(endpoint) !== true) {
      continue;
    }

    const models = getModelsForEndpoint(endpoint);
    if (models.length === 0) {
      continue;
    }

    return {
      endpoint,
      models,
    };
  }

  return null;
}
