import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  createChannelPairKey,
  normalizeAdminChannelDocument,
  type RawAdminChannelDocument,
} from './channelDomain';
import { createStatusError, parseObjectId } from './utils';

const { AdminChannel } = createModels(mongoose);

const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const managedProviderTypes = [
  'azureOpenAI',
  'custom',
  'ollama',
  'openAI',
  'google',
  'anthropic',
  'bedrock',
] as const;

const pricingOverrideSchema = z
  .object({
    prompt: z.number().finite().nullable().optional().default(null),
    completion: z.number().finite().nullable().optional().default(null),
    write: z.number().finite().nullable().optional().default(null),
    read: z.number().finite().nullable().optional().default(null),
  })
  .nullable()
  .optional()
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const normalized = {
      prompt: value.prompt ?? null,
      completion: value.completion ?? null,
      write: value.write ?? null,
      read: value.read ?? null,
    };

    if (Object.values(normalized).every((entry) => entry == null)) {
      return null;
    }

    return normalized;
  });

const channelHeaderSchema = z.object({
  key: z.string().trim().min(1, 'header key is required'),
  value: z.string().trim().min(1, 'header value is required'),
});

const channelModelSchema = z.object({
  model: z.string().trim().min(1, 'model is required'),
  enabled: z.boolean().optional().default(true),
  deploymentName: z.string().trim().optional().default(''),
  pricingOverride: pricingOverrideSchema,
});

const channelConnectionSchema = z.object({
  runtimeEndpoint: z.string().trim().min(1, 'runtime endpoint is required'),
  baseURL: z.string().trim().optional().default(''),
  instanceName: z.string().trim().optional().default(''),
  apiVersion: z.string().trim().optional().default(''),
  region: z.string().trim().optional().default(''),
  modelFetch: z.boolean().optional().default(false),
  headers: z.array(channelHeaderSchema).optional().default([]),
});

const channelSecretsSchema = z.object({
  apiKey: z.string().trim().optional().default(''),
  apiKeyRef: z.string().trim().optional().default(''),
  accessKeyId: z.string().trim().optional().default(''),
  accessKeyIdRef: z.string().trim().optional().default(''),
  secretAccessKey: z.string().trim().optional().default(''),
  secretAccessKeyRef: z.string().trim().optional().default(''),
  sessionToken: z.string().trim().optional().default(''),
  sessionTokenRef: z.string().trim().optional().default(''),
});

const adminChannelInputSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'slug is required')
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => slugPattern.test(value),
      'slug must contain only lowercase letters, numbers, hyphens, or underscores',
    ),
  providerType: z.enum(managedProviderTypes, {
    errorMap: () => ({ message: 'provider type is required' }),
  }),
  description: z.string().trim().optional().default(''),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int('sortOrder must be an integer').optional().default(0),
  connection: channelConnectionSchema,
  secrets: channelSecretsSchema.optional().default({
    apiKey: '',
    apiKeyRef: '',
    accessKeyId: '',
    accessKeyIdRef: '',
    secretAccessKey: '',
    secretAccessKeyRef: '',
    sessionToken: '',
    sessionTokenRef: '',
  }),
  models: z.array(channelModelSchema).min(1, 'at least one model is required'),
});

type AdminChannelLoaders = {
  getAppConfig: (options?: { role?: string }) => Promise<AppConfig>;
  getEndpointsConfig: (req: Request) => Promise<TEndpointsConfig>;
  getModelsConfig: (req: Request) => Promise<TModelsConfig>;
  refreshRuntimeConfig?: () => Promise<unknown>;
};

type AdminChannelRecord = RawAdminChannelDocument & {
  _id: mongoose.Types.ObjectId;
};

type AdminChannelInput = z.infer<typeof adminChannelInputSchema>;
type AdminChannelModelInput = AdminChannelInput['models'][number];

function sanitizeChannel(channel: AdminChannelRecord) {
  const normalized = normalizeAdminChannelDocument(channel);

  return {
    id: channel._id.toString(),
    name: normalized.name,
    slug: normalized.slug,
    providerType: normalized.providerType,
    description: normalized.description,
    enabled: normalized.enabled,
    sortOrder: normalized.sortOrder,
    connection: normalized.connection,
    secrets: normalized.secrets,
    models: normalized.models,
    createdAt: normalized.createdAt?.toISOString() ?? null,
    updatedAt: normalized.updatedAt?.toISOString() ?? null,
  };
}

function handleAdminError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request body';
    return res.status(400).json({ message });
  }

  const statusCode =
    error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    logger.error(context, error);
  }

  const message =
    error instanceof Error ? error.message : 'An unexpected admin request error occurred';
  return res.status(statusCode).json({ message });
}

function parseAdminChannelInput(input: unknown): AdminChannelInput {
  const parsed = adminChannelInputSchema.parse(input);
  const seenModels = new Set<string>();

  for (const model of parsed.models) {
    const normalizedModel = model.model.trim().toLowerCase();
    if (seenModels.has(normalizedModel)) {
      throw createStatusError(400, 'Duplicate channel models are not allowed');
    }
    seenModels.add(normalizedModel);
  }

  const normalizedProviderDefaults =
    parsed.providerType === 'custom'
      ? parsed
      : {
          ...parsed,
          connection: {
            ...parsed.connection,
            runtimeEndpoint: parsed.providerType,
          },
        };

  return normalizedProviderDefaults;
}

function hasApiKeyValue(input: AdminChannelInput): boolean {
  return input.secrets.apiKey.trim().length > 0 || input.secrets.apiKeyRef.trim().length > 0;
}

function hasAwsAccessKeyValue(input: AdminChannelInput): boolean {
  return (
    input.secrets.accessKeyId.trim().length > 0 || input.secrets.accessKeyIdRef.trim().length > 0
  );
}

function hasAwsSecretValue(input: AdminChannelInput): boolean {
  return (
    input.secrets.secretAccessKey.trim().length > 0 ||
    input.secrets.secretAccessKeyRef.trim().length > 0
  );
}

async function ensureUniqueSlug(slug: string, channelId?: mongoose.Types.ObjectId) {
  const query: mongoose.FilterQuery<AdminChannelRecord> = channelId
    ? { slug, _id: { $ne: channelId } }
    : { slug };

  const existing = await AdminChannel.findOne(query)
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (existing) {
    throw createStatusError(409, 'A channel with this slug already exists');
  }
}

async function getChannelOrThrow(channelIdParam: string) {
  const channelId = parseObjectId(channelIdParam, 'channelId');
  const channel = await AdminChannel.findById(channelId).lean<AdminChannelRecord | null>();
  if (!channel) {
    throw createStatusError(404, 'Channel not found');
  }

  return { channelId, channel };
}

function validateModelCollection(input: AdminChannelInput) {
  if (
    input.providerType !== 'custom' &&
    input.providerType !== 'ollama' &&
    input.connection.runtimeEndpoint !== input.providerType
  ) {
    throw createStatusError(
      400,
      `${input.providerType} channels must use the ${input.providerType} runtime endpoint`,
    );
  }

  if (input.providerType === 'azureOpenAI') {
    if (input.connection.instanceName.trim().length === 0) {
      throw createStatusError(400, 'Azure channels require an instance name');
    }

    if (input.connection.apiVersion.trim().length === 0) {
      throw createStatusError(400, 'Azure channels require an API version');
    }

    if (!hasApiKeyValue(input)) {
      throw createStatusError(400, 'Azure channels require an API key or API key reference');
    }
  }

  if (input.providerType === 'ollama') {
    if (input.connection.baseURL.trim().length === 0) {
      throw createStatusError(400, 'Ollama channels require a base URL');
    }
  }

  if (
    (input.providerType === 'openAI' ||
      input.providerType === 'google' ||
      input.providerType === 'anthropic') &&
    !hasApiKeyValue(input)
  ) {
    throw createStatusError(
      400,
      `${input.providerType} channels require an API key or API key reference`,
    );
  }

  if (input.providerType === 'bedrock') {
    if (input.connection.region.trim().length === 0) {
      throw createStatusError(400, 'Bedrock channels require a region');
    }

    if (hasAwsAccessKeyValue(input) !== hasAwsSecretValue(input)) {
      throw createStatusError(
        400,
        'Bedrock channels require both access key ID and secret access key when using static credentials',
      );
    }
  }

  const duplicatePairs = new Set<string>();
  for (const model of input.models) {
    if (
      input.providerType === 'azureOpenAI' &&
      model.enabled === true &&
      model.deploymentName.trim().length === 0
    ) {
      throw createStatusError(400, 'Enabled Azure models require a deployment name');
    }

    const pairKey = createChannelPairKey(input.connection.runtimeEndpoint, model.model);
    if (duplicatePairs.has(pairKey)) {
      throw createStatusError(400, 'Duplicate runtime endpoint/model pairs are not allowed');
    }
    duplicatePairs.add(pairKey);
  }
}

function toStoredChannel(input: AdminChannelInput) {
  const normalized = normalizeAdminChannelDocument(input);

  return {
    name: normalized.name,
    slug: normalized.slug,
    providerType: normalized.providerType,
    description: normalized.description,
    enabled: normalized.enabled,
    sortOrder: normalized.sortOrder,
    connection: normalized.connection,
    secrets: normalized.secrets,
    models: normalized.models.map((model: AdminChannelModelInput) => ({
      model: model.model,
      enabled: model.enabled,
      deploymentName: model.deploymentName,
      pricingOverride: model.pricingOverride,
    })),
  };
}

export function createAdminChannelsHandlers(loaders: AdminChannelLoaders) {
  return {
    async getAdminChannels(_req: Request, res: Response) {
      try {
        const channels = await AdminChannel.find({})
          .sort({ sortOrder: 1, name: 1, _id: 1 })
          .lean<AdminChannelRecord[]>();

        return res.status(200).json({
          channels: channels.map(sanitizeChannel),
        });
      } catch (error) {
        return handleAdminError(error, res, '[getAdminChannels]');
      }
    },

    async getAdminChannel(req: Request, res: Response) {
      try {
        const { channel } = await getChannelOrThrow(req.params.channelId);
        return res.status(200).json(sanitizeChannel(channel));
      } catch (error) {
        return handleAdminError(error, res, '[getAdminChannel]');
      }
    },

    async createAdminChannel(req: Request, res: Response) {
      try {
        const input = parseAdminChannelInput(req.body);
        validateModelCollection(input);
        await ensureUniqueSlug(input.slug);

        const createdChannel = await AdminChannel.create(toStoredChannel(input));
        const createdId = parseObjectId(createdChannel._id.toString(), 'channelId');
        const storedChannel = await AdminChannel.findById(createdId).lean<AdminChannelRecord | null>();

        if (!storedChannel) {
          throw createStatusError(500, 'Failed to load created channel');
        }

        await loaders.refreshRuntimeConfig?.();

        return res.status(201).json(sanitizeChannel(storedChannel));
      } catch (error) {
        return handleAdminError(error, res, '[createAdminChannel]');
      }
    },

    async updateAdminChannel(req: Request, res: Response) {
      try {
        const { channelId } = await getChannelOrThrow(req.params.channelId);
        const input = parseAdminChannelInput(req.body);
        validateModelCollection(input);
        await ensureUniqueSlug(input.slug, channelId);

        const updatedChannel = await AdminChannel.findByIdAndUpdate(
          channelId,
          {
            $set: toStoredChannel(input),
            $unset: {
              entries: 1,
              icon: 1,
            },
          },
          { new: true },
        ).lean<AdminChannelRecord | null>();

        if (!updatedChannel) {
          throw createStatusError(404, 'Channel not found');
        }

        await loaders.refreshRuntimeConfig?.();

        return res.status(200).json(sanitizeChannel(updatedChannel));
      } catch (error) {
        return handleAdminError(error, res, '[updateAdminChannel]');
      }
    },

    async deleteAdminChannel(req: Request, res: Response) {
      try {
        const { channelId } = await getChannelOrThrow(req.params.channelId);
        await AdminChannel.deleteOne({ _id: channelId });
        await loaders.refreshRuntimeConfig?.();

        return res.status(200).json({
          id: channelId.toString(),
          deleted: true,
        });
      } catch (error) {
        return handleAdminError(error, res, '[deleteAdminChannel]');
      }
    },
  };
}
