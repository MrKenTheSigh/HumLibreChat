import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { TCustomConfig } from 'librechat-data-provider';
import { createStatusError } from './utils';
import { writeRequestActivityLog } from './activityLogs';

const { AdminSystemSetting } = createModels(mongoose);

const SYSTEM_SETTING_KEYS = {
  memory: 'memory',
} as const;

const defaultMemorySetting = {
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

const modelParametersSchema = z.record(z.unknown()).optional().default({});

const memorySystemSettingSchema = z.object({
  enabled: z.boolean().optional().default(defaultMemorySetting.enabled),
  validKeys: z
    .array(z.string().trim().min(1))
    .optional()
    .default(defaultMemorySetting.validKeys),
  tokenLimit: z.number().int().positive().nullable().optional().default(defaultMemorySetting.tokenLimit),
  messageWindowSize: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(defaultMemorySetting.messageWindowSize),
  agent: z
    .object({
      provider: z.string().trim().min(1).default(defaultMemorySetting.agent.provider),
      model: z.string().trim().min(1).default(defaultMemorySetting.agent.model),
      instructions: z.string().trim().optional().default(defaultMemorySetting.agent.instructions),
      model_parameters: modelParametersSchema,
    })
    .optional()
    .default(defaultMemorySetting.agent),
});

export type AdminMemorySystemSetting = z.infer<typeof memorySystemSettingSchema>;

type AdminSystemSettingRecord = {
  _id: mongoose.Types.ObjectId;
  key: string;
  value: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminSystemSettingsLoaders = {
  getSetting: (key: string) => Promise<AdminSystemSettingRecord | null>;
};

type AdminSystemSettingsHandlersOptions = {
  refreshRuntimeConfig?: () => Promise<unknown>;
};

function createDefaultLoaders(): AdminSystemSettingsLoaders {
  return {
    getSetting: async (key) =>
      AdminSystemSetting.findOne({ key }).lean<AdminSystemSettingRecord | null>(),
  };
}

function normalizeMemorySetting(input: unknown): AdminMemorySystemSetting {
  return memorySystemSettingSchema.parse(input ?? {});
}

function sanitizeMemorySetting(input: unknown) {
  return normalizeMemorySetting(input);
}

function toRuntimeMemoryConfig(setting: AdminMemorySystemSetting): TCustomConfig['memory'] {
  if (!setting.enabled) {
    return {
      disabled: true,
      personalize: true,
    };
  }

  const agent = {
    provider: setting.agent.provider,
    model: setting.agent.model,
    ...(setting.agent.instructions.length > 0 && { instructions: setting.agent.instructions }),
    ...(Object.keys(setting.agent.model_parameters).length > 0 && {
      model_parameters: setting.agent.model_parameters,
    }),
  };

  return {
    disabled: false,
    personalize: true,
    validKeys: setting.validKeys,
    messageWindowSize: setting.messageWindowSize,
    ...(setting.tokenLimit != null && { tokenLimit: setting.tokenLimit }),
    agent,
  };
}

function handleAdminSystemSettingsError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid system setting payload';
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
    error instanceof Error ? error.message : 'An unexpected system settings request error occurred';
  return res.status(statusCode).json({ message });
}

export async function getStoredMemorySystemSetting(
  loaders: AdminSystemSettingsLoaders = createDefaultLoaders(),
): Promise<AdminMemorySystemSetting> {
  const record = await loaders.getSetting(SYSTEM_SETTING_KEYS.memory);
  return sanitizeMemorySetting(record?.value);
}

export function createLoadManagedSystemSettingsIntoConfig(
  loaders: AdminSystemSettingsLoaders = createDefaultLoaders(),
) {
  return async function loadManagedSystemSettingsIntoConfig(
    baseConfig: Partial<TCustomConfig>,
  ): Promise<Partial<TCustomConfig>> {
    const memory = await getStoredMemorySystemSetting(loaders);
    return {
      ...baseConfig,
      memory: toRuntimeMemoryConfig(memory),
    };
  };
}

export const loadManagedSystemSettingsIntoConfig = createLoadManagedSystemSettingsIntoConfig();

export function createAdminSystemSettingsHandlers(
  options: AdminSystemSettingsHandlersOptions = {},
) {
  return {
    getAdminSystemSettings: async (_req: Request, res: Response) => {
      try {
        const memory = await getStoredMemorySystemSetting();
        return res.json({ memory });
      } catch (error) {
        return handleAdminSystemSettingsError(error, res, '[getAdminSystemSettings]');
      }
    },
    updateAdminMemorySystemSetting: async (req: Request, res: Response) => {
      try {
        const memory = normalizeMemorySetting(req.body);

        const updated = await AdminSystemSetting.findOneAndUpdate(
          { key: SYSTEM_SETTING_KEYS.memory },
          { value: memory },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean<AdminSystemSettingRecord | null>();

        if (!updated) {
          throw createStatusError(500, 'Failed to update memory system setting');
        }

        await options.refreshRuntimeConfig?.();
        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.memory,
          action: 'system_setting.memory.update',
          result: 'success',
          message: 'Updated memory system setting',
          metadata: {
            enabled: memory.enabled,
            provider: memory.agent.provider,
            model: memory.agent.model,
          },
        });

        return res.json({ memory: sanitizeMemorySetting(updated.value) });
      } catch (error) {
        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.memory,
          action: 'system_setting.memory.update',
          result: 'failure',
          message:
            error instanceof Error ? error.message : 'Failed to update memory system setting',
        });
        return handleAdminSystemSettingsError(error, res, '[updateAdminMemorySystemSetting]');
      }
    },
  };
}
