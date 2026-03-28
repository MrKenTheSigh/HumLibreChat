import type {
  AdminChannel,
  AdminChannelConnection,
  AdminChannelModel,
  AdminChannelPricingOverride,
  AdminChannelProviderType,
  AdminChannelSecrets,
} from 'librechat-data-provider';

type LegacyAdminChannelEntryRecord = {
  endpoint?: string;
  model?: string;
  enabled?: boolean;
};

type RawAdminChannelPricingOverride = Partial<AdminChannelPricingOverride> | null | undefined;

type RawAdminChannelModel = Partial<AdminChannelModel> & {
  pricingOverride?: RawAdminChannelPricingOverride;
};

type RawAdminChannelConnection = Partial<AdminChannelConnection> | null | undefined;
type RawAdminChannelSecrets = Partial<AdminChannelSecrets> | null | undefined;

export type RawAdminChannelDocument = {
  name: string;
  slug: string;
  providerType?: AdminChannelProviderType;
  description?: string;
  enabled?: boolean;
  sortOrder?: number;
  connection?: RawAdminChannelConnection;
  secrets?: RawAdminChannelSecrets;
  models?: RawAdminChannelModel[];
  entries?: LegacyAdminChannelEntryRecord[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type NormalizedAdminChannelDocument = Omit<AdminChannel, 'id' | 'createdAt' | 'updatedAt'> & {
  createdAt: Date | null;
  updatedAt: Date | null;
};

const emptyPricingOverride: AdminChannelPricingOverride = {
  prompt: null,
  completion: null,
  write: null,
  read: null,
};

const emptySecrets: AdminChannelSecrets = {
  apiKey: '',
  apiKeyRef: '',
  accessKeyId: '',
  accessKeyIdRef: '',
  secretAccessKey: '',
  secretAccessKeyRef: '',
  sessionToken: '',
  sessionTokenRef: '',
};

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeProviderType(channel: RawAdminChannelDocument): AdminChannelProviderType {
  if (
    channel.providerType === 'azureOpenAI' ||
    channel.providerType === 'custom' ||
    channel.providerType === 'ollama' ||
    channel.providerType === 'openAI' ||
    channel.providerType === 'google' ||
    channel.providerType === 'anthropic' ||
    channel.providerType === 'bedrock'
  ) {
    return channel.providerType;
  }

  const legacyEndpoint = normalizeString(channel.entries?.[0]?.endpoint);
  if (legacyEndpoint === 'azureOpenAI') {
    return 'azureOpenAI';
  }

  if (
    legacyEndpoint === 'ollama' ||
    legacyEndpoint === 'openAI' ||
    legacyEndpoint === 'google' ||
    legacyEndpoint === 'anthropic' ||
    legacyEndpoint === 'bedrock'
  ) {
    return legacyEndpoint;
  }

  return 'custom';
}

function normalizePricingOverride(
  pricingOverride: RawAdminChannelPricingOverride,
): AdminChannelPricingOverride | null {
  const normalized = {
    prompt: normalizeNumber(pricingOverride?.prompt),
    completion: normalizeNumber(pricingOverride?.completion),
    write: normalizeNumber(pricingOverride?.write),
    read: normalizeNumber(pricingOverride?.read),
  };

  if (Object.values(normalized).every((value) => value == null)) {
    return null;
  }

  return normalized;
}

function normalizeConnection(
  connection: RawAdminChannelConnection,
  providerType: AdminChannelProviderType,
  legacyEndpoint: string,
): AdminChannelConnection {
  const runtimeEndpoint =
    normalizeString(connection?.runtimeEndpoint) ||
    legacyEndpoint ||
    (providerType === 'custom' ? '' : providerType);

  return {
    runtimeEndpoint,
    baseURL: normalizeString(connection?.baseURL),
    instanceName: normalizeString(connection?.instanceName),
    apiVersion: normalizeString(connection?.apiVersion),
    region: normalizeString(connection?.region),
    modelFetch: connection?.modelFetch === true,
    headers: (connection?.headers ?? [])
      .map((header) => ({
        key: normalizeString(header.key),
        value: normalizeString(header.value),
      }))
      .filter((header) => header.key.length > 0 && header.value.length > 0),
  };
}

function normalizeSecrets(secrets: RawAdminChannelSecrets): AdminChannelSecrets {
  return {
    ...emptySecrets,
    apiKey: normalizeString(secrets?.apiKey),
    apiKeyRef: normalizeString(secrets?.apiKeyRef),
    accessKeyId: normalizeString(secrets?.accessKeyId),
    accessKeyIdRef: normalizeString(secrets?.accessKeyIdRef),
    secretAccessKey: normalizeString(secrets?.secretAccessKey),
    secretAccessKeyRef: normalizeString(secrets?.secretAccessKeyRef),
    sessionToken: normalizeString(secrets?.sessionToken),
    sessionTokenRef: normalizeString(secrets?.sessionTokenRef),
  };
}

function normalizeModel(model: RawAdminChannelModel): AdminChannelModel | null {
  const normalizedModel = normalizeString(model.model);
  if (normalizedModel.length === 0) {
    return null;
  }

  return {
    model: normalizedModel,
    enabled: model.enabled !== false,
    deploymentName: normalizeString(model.deploymentName),
    pricingOverride: normalizePricingOverride(model.pricingOverride),
  };
}

function normalizeLegacyEntry(entry: LegacyAdminChannelEntryRecord): AdminChannelModel | null {
  const model = normalizeString(entry.model);
  if (model.length === 0) {
    return null;
  }

  return {
    model,
    enabled: entry.enabled !== false,
    deploymentName: '',
    pricingOverride: null,
  };
}

export function normalizeAdminChannelDocument(
  channel: RawAdminChannelDocument,
): NormalizedAdminChannelDocument {
  const providerType = normalizeProviderType(channel);
  const legacyEndpoint = normalizeString(channel.entries?.[0]?.endpoint);
  const normalizedModels = (channel.models ?? [])
    .map(normalizeModel)
    .filter((model): model is AdminChannelModel => model != null);
  const models =
    normalizedModels.length > 0
      ? normalizedModels
      : (channel.entries ?? [])
          .map(normalizeLegacyEntry)
          .filter((model): model is AdminChannelModel => model != null);

  return {
    name: channel.name,
    slug: channel.slug,
    providerType,
    description: normalizeString(channel.description),
    enabled: channel.enabled !== false,
    sortOrder: typeof channel.sortOrder === 'number' ? channel.sortOrder : 0,
    connection: normalizeConnection(channel.connection, providerType, legacyEndpoint),
    secrets: normalizeSecrets(channel.secrets),
    models,
    createdAt: channel.createdAt ?? null,
    updatedAt: channel.updatedAt ?? null,
  };
}

export function createChannelPairKey(endpoint: string, model: string): string {
  return `${endpoint.trim()}::${model.trim()}`;
}

export function getChannelAllowedPairs(
  channel: Pick<NormalizedAdminChannelDocument, 'connection' | 'models'>,
): Array<{ endpoint: string; model: string }> {
  const endpoint = channel.connection.runtimeEndpoint.trim();
  if (endpoint.length === 0) {
    return [];
  }

  return channel.models.reduce<Array<{ endpoint: string; model: string }>>((pairs, model) => {
    if (model.enabled !== true) {
      return pairs;
    }

    pairs.push({
      endpoint,
      model: model.model,
    });
    return pairs;
  }, []);
}
