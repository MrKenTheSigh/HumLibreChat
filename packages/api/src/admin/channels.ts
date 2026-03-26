import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type {
  AdminChannelInventoryResponse,
  TEndpointsConfig,
  TModelsConfig,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { buildAdminChannelInventory } from './channelInventory';
import { createStatusError, parseObjectId } from './utils';

const { AdminChannel } = createModels(mongoose);

const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const adminChannelEntrySchema = z.object({
  endpoint: z.string().trim().min(1, 'entry endpoint is required'),
  model: z.string().trim().min(1, 'entry model is required'),
  label: z.string().trim().min(1, 'entry label is required'),
  enabled: z.boolean().optional().default(true),
  defaultParameters: z.null().optional().default(null),
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
  description: z.string().trim().optional().default(''),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int('sortOrder must be an integer').optional().default(0),
  icon: z.string().trim().optional().default(''),
  entries: z.array(adminChannelEntrySchema).min(1, 'at least one entry is required'),
});

type AdminChannelLoaders = {
  getAppConfig: (options?: { role?: string }) => Promise<AppConfig>;
  getEndpointsConfig: (req: Request) => Promise<TEndpointsConfig>;
  getModelsConfig: (req: Request) => Promise<TModelsConfig>;
};

type AdminChannelRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  sortOrder?: number;
  icon?: string;
  entries: Array<{
    endpoint: string;
    model: string;
    label: string;
    enabled?: boolean;
    defaultParameters?: null;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminChannelInput = z.infer<typeof adminChannelInputSchema>;
type AdminChannelEntryInput = AdminChannelInput['entries'][number];

function sanitizeChannel(channel: AdminChannelRecord) {
  return {
    id: channel._id.toString(),
    name: channel.name,
    slug: channel.slug,
    description: channel.description ?? '',
    enabled: channel.enabled ?? true,
    sortOrder: channel.sortOrder ?? 0,
    icon: channel.icon ?? '',
    entries: channel.entries.map((entry) => ({
      endpoint: entry.endpoint,
      model: entry.model,
      label: entry.label,
      enabled: entry.enabled ?? true,
      defaultParameters: null,
    })),
    createdAt: channel.createdAt?.toISOString() ?? null,
    updatedAt: channel.updatedAt?.toISOString() ?? null,
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

function normalizeEntryKey(entry: Pick<AdminChannelEntryInput, 'endpoint' | 'model'>): string {
  return `${entry.endpoint.trim()}::${entry.model.trim()}`;
}

function parseAdminChannelInput(input: unknown): AdminChannelInput {
  const parsed = adminChannelInputSchema.parse(input);
  const seen = new Set<string>();

  for (const entry of parsed.entries) {
    const key = normalizeEntryKey(entry);
    if (seen.has(key)) {
      throw createStatusError(400, 'Duplicate endpoint/model entries are not allowed');
    }
    seen.add(key);
  }

  return parsed;
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

function createInventoryKeySet(inventory: AdminChannelInventoryResponse['inventory']): Set<string> {
  return inventory.reduce<Set<string>>(
    (
      set: Set<string>,
      item: AdminChannelInventoryResponse['inventory'][number],
    ): Set<string> => {
      set.add(normalizeEntryKey(item));
      return set;
    },
    new Set<string>(),
  );
}

async function loadInventory(
  req: Request,
  loaders: AdminChannelLoaders,
): Promise<AdminChannelInventoryResponse['inventory']> {
  const [appConfig, endpointsConfig, modelsConfig] = await Promise.all([
    loaders.getAppConfig(),
    loaders.getEndpointsConfig(req),
    loaders.getModelsConfig(req),
  ]);

  return buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig).inventory;
}

function validateEntriesAgainstInventory(
  entries: AdminChannelEntryInput[],
  inventory: AdminChannelInventoryResponse['inventory'],
) {
  const inventoryKeys = createInventoryKeySet(inventory);
  const invalidEntry = entries.find((entry) => inventoryKeys.has(normalizeEntryKey(entry)) !== true);
  if (invalidEntry) {
    throw createStatusError(
      400,
      `Invalid channel entry: ${invalidEntry.endpoint} / ${invalidEntry.model}`,
    );
  }
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
        const inventory = await loadInventory(req, loaders);
        validateEntriesAgainstInventory(input.entries, inventory);
        await ensureUniqueSlug(input.slug);

        const createdChannel = await AdminChannel.create(input);
        const createdId = parseObjectId(createdChannel._id.toString(), 'channelId');
        const storedChannel = await AdminChannel.findById(createdId).lean<AdminChannelRecord | null>();

        if (!storedChannel) {
          throw createStatusError(500, 'Failed to load created channel');
        }

        return res.status(201).json(sanitizeChannel(storedChannel));
      } catch (error) {
        return handleAdminError(error, res, '[createAdminChannel]');
      }
    },

    async updateAdminChannel(req: Request, res: Response) {
      try {
        const { channelId } = await getChannelOrThrow(req.params.channelId);
        const input = parseAdminChannelInput(req.body);
        const inventory = await loadInventory(req, loaders);
        validateEntriesAgainstInventory(input.entries, inventory);
        await ensureUniqueSlug(input.slug, channelId);

        const updatedChannel = await AdminChannel.findByIdAndUpdate(
          channelId,
          { $set: input },
          { new: true },
        ).lean<AdminChannelRecord | null>();

        if (!updatedChannel) {
          throw createStatusError(404, 'Channel not found');
        }

        return res.status(200).json(sanitizeChannel(updatedChannel));
      } catch (error) {
        return handleAdminError(error, res, '[updateAdminChannel]');
      }
    },

    async deleteAdminChannel(req: Request, res: Response) {
      try {
        const { channelId } = await getChannelOrThrow(req.params.channelId);
        await AdminChannel.deleteOne({ _id: channelId });

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
