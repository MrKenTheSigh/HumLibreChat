import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import { SENSITIVE_RULE_CODES } from '../sensitiveInformation';
import type { Request, Response } from 'express';
import {
  RerankerTypes,
  SafeSearchTypes,
  ScraperProviders,
  SearchProviders,
  type TCustomConfig,
} from 'librechat-data-provider';
import type { SensitivePolicyAction } from '../sensitiveInformation';
import { createStatusError } from './utils';
import { writeRequestActivityLog } from './activityLogs';

const { AdminSystemSetting } = createModels(mongoose);

const SYSTEM_SETTING_KEYS = {
  memory: 'memory',
  webSearch: 'web_search',
  sensitiveInformationPolicy: 'sensitive_information_policy',
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

const defaultWebSearchSetting = {
  searchProvider: SearchProviders.SERPER,
  scraperProvider: ScraperProviders.FIRECRAWL,
  rerankerType: RerankerTypes.JINA,
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
  safeSearch: SafeSearchTypes.MODERATE,
};

const defaultSensitiveInformationPolicySetting: {
  enabled: boolean;
  window: {
    type: 'daily';
    durationDays: number;
  };
  rules: Array<{
    ruleCode: (typeof SENSITIVE_RULE_CODES)[number];
    thresholds: Array<{
      minCount: number;
      action: SensitivePolicyAction;
    }>;
  }>;
} = {
  enabled: false,
  window: {
    type: 'daily',
    durationDays: 1,
  },
  rules: SENSITIVE_RULE_CODES.map((ruleCode) => ({
    ruleCode,
    thresholds: [
      { minCount: 1, action: 'record' },
      { minCount: 20, action: 'warn' },
      { minCount: 50, action: 'block' },
    ],
  })),
};

const memorySystemSettingSchema = z.object({
  enabled: z.boolean().optional().default(defaultMemorySetting.enabled),
  validKeys: z.array(z.string().trim().min(1)).optional().default(defaultMemorySetting.validKeys),
  tokenLimit: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .default(defaultMemorySetting.tokenLimit),
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

const sensitivePolicyActionSchema = z.enum(['none', 'record', 'warn', 'block']);

const sensitiveInformationPolicySystemSettingSchema = z.object({
  enabled: z.boolean().optional().default(defaultSensitiveInformationPolicySetting.enabled),
  window: z
    .object({
      type: z
        .enum(['rolling', 'daily'])
        .optional()
        .default(defaultSensitiveInformationPolicySetting.window.type),
      durationMinutes: z.number().int().min(1).optional(),
      durationDays: z.number().int().min(1).optional(),
    })
    .optional()
    .default(defaultSensitiveInformationPolicySetting.window),
  rules: z
    .array(
      z.object({
        ruleCode: z.enum(SENSITIVE_RULE_CODES),
        thresholds: z.array(
          z.object({
            minCount: z.number().int().min(0),
            action: sensitivePolicyActionSchema,
          }),
        ),
      }),
    )
    .optional()
    .default(defaultSensitiveInformationPolicySetting.rules),
});

const webSearchSystemSettingSchema = z.object({
  searchProvider: z
    .nativeEnum(SearchProviders)
    .optional()
    .default(defaultWebSearchSetting.searchProvider),
  scraperProvider: z
    .nativeEnum(ScraperProviders)
    .optional()
    .default(defaultWebSearchSetting.scraperProvider),
  rerankerType: z
    .nativeEnum(RerankerTypes)
    .optional()
    .default(defaultWebSearchSetting.rerankerType),
  serperApiKey: z.string().trim().optional().default(defaultWebSearchSetting.serperApiKey),
  searxngInstanceUrl: z
    .string()
    .trim()
    .optional()
    .default(defaultWebSearchSetting.searxngInstanceUrl),
  searxngApiKey: z.string().trim().optional().default(defaultWebSearchSetting.searxngApiKey),
  firecrawlApiKey: z.string().trim().optional().default(defaultWebSearchSetting.firecrawlApiKey),
  firecrawlApiUrl: z.string().trim().optional().default(defaultWebSearchSetting.firecrawlApiUrl),
  firecrawlVersion: z.string().trim().optional().default(defaultWebSearchSetting.firecrawlVersion),
  jinaApiKey: z.string().trim().optional().default(defaultWebSearchSetting.jinaApiKey),
  jinaApiUrl: z.string().trim().optional().default(defaultWebSearchSetting.jinaApiUrl),
  cohereApiKey: z.string().trim().optional().default(defaultWebSearchSetting.cohereApiKey),
  scraperTimeout: z
    .number()
    .int()
    .positive()
    .optional()
    .default(defaultWebSearchSetting.scraperTimeout),
  safeSearch: z.nativeEnum(SafeSearchTypes).optional().default(defaultWebSearchSetting.safeSearch),
});

export type AdminMemorySystemSetting = z.infer<typeof memorySystemSettingSchema>;
export type AdminWebSearchSystemSetting = z.infer<typeof webSearchSystemSettingSchema>;
export type AdminSensitiveInformationPolicySystemSetting = z.infer<
  typeof sensitiveInformationPolicySystemSettingSchema
>;

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

function normalizeWebSearchSetting(input: unknown): AdminWebSearchSystemSetting {
  return webSearchSystemSettingSchema.parse(input ?? {});
}

function normalizeSensitiveInformationPolicySetting(
  input: unknown,
): AdminSensitiveInformationPolicySystemSetting {
  const parsed = sensitiveInformationPolicySystemSettingSchema.parse(input ?? {});
  const defaultRulesByCode = new Map(
    defaultSensitiveInformationPolicySetting.rules.map((rule) => [rule.ruleCode, rule]),
  );
  const parsedRulesByCode = new Map(parsed.rules.map((rule) => [rule.ruleCode, rule]));

  return {
    ...parsed,
    window: {
      type: 'daily',
      durationDays:
        parsed.window.durationDays ??
        (parsed.window.durationMinutes
          ? Math.max(1, Math.ceil(parsed.window.durationMinutes / 1440))
          : defaultSensitiveInformationPolicySetting.window.durationDays),
    },
    rules: SENSITIVE_RULE_CODES.map((ruleCode) => {
      const defaultRule = defaultRulesByCode.get(ruleCode);
      const parsedRule = parsedRulesByCode.get(ruleCode);
      const thresholdsByAction = new Map(
        defaultRule?.thresholds.map((threshold) => [threshold.action, threshold]) ?? [],
      );

      for (const threshold of parsedRule?.thresholds ?? []) {
        thresholdsByAction.set(threshold.action, threshold);
      }

      const recordThreshold = thresholdsByAction.get('record');
      if (recordThreshold?.minCount === 2) {
        thresholdsByAction.set('record', { ...recordThreshold, minCount: 1 });
      }

      return {
        ruleCode,
        thresholds: Array.from(thresholdsByAction.values()).sort(
          (left, right) => left.minCount - right.minCount,
        ),
      };
    }),
  };
}

function sanitizeMemorySetting(input: unknown) {
  return normalizeMemorySetting(input);
}

function sanitizeWebSearchSetting(input: unknown) {
  return normalizeWebSearchSetting(input);
}

function sanitizeSensitiveInformationPolicySetting(input: unknown) {
  return normalizeSensitiveInformationPolicySetting(input);
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

function trimEmptyWebSearchValues(
  setting: AdminWebSearchSystemSetting,
): TCustomConfig['webSearch'] {
  const runtimeConfig: TCustomConfig['webSearch'] = {
    searchProvider: setting.searchProvider,
    scraperProvider: setting.scraperProvider,
    rerankerType: setting.rerankerType,
    scraperTimeout: setting.scraperTimeout,
    safeSearch: setting.safeSearch,
  };

  const stringKeys = [
    'serperApiKey',
    'searxngInstanceUrl',
    'searxngApiKey',
    'firecrawlApiKey',
    'firecrawlApiUrl',
    'firecrawlVersion',
    'jinaApiKey',
    'jinaApiUrl',
    'cohereApiKey',
  ] as const;

  for (const key of stringKeys) {
    const value = setting[key];
    if (value.length > 0) {
      runtimeConfig[key] = value;
    }
  }

  return runtimeConfig;
}

function mergeRuntimeWebSearchConfig(
  baseConfig: Partial<TCustomConfig>,
  setting: AdminWebSearchSystemSetting | null,
): Partial<TCustomConfig> {
  if (!setting) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    webSearch: trimEmptyWebSearchValues(setting),
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

export async function getStoredWebSearchSystemSetting(
  loaders: AdminSystemSettingsLoaders = createDefaultLoaders(),
): Promise<AdminWebSearchSystemSetting> {
  const record = await loaders.getSetting(SYSTEM_SETTING_KEYS.webSearch);
  return sanitizeWebSearchSetting(record?.value);
}

export async function getStoredSensitiveInformationPolicySystemSetting(
  loaders: AdminSystemSettingsLoaders = createDefaultLoaders(),
): Promise<AdminSensitiveInformationPolicySystemSetting> {
  const record = await loaders.getSetting(SYSTEM_SETTING_KEYS.sensitiveInformationPolicy);
  return sanitizeSensitiveInformationPolicySetting(record?.value);
}

export function createLoadManagedSystemSettingsIntoConfig(
  loaders: AdminSystemSettingsLoaders = createDefaultLoaders(),
) {
  return async function loadManagedSystemSettingsIntoConfig(
    baseConfig: Partial<TCustomConfig>,
  ): Promise<Partial<TCustomConfig>> {
    const memory = await getStoredMemorySystemSetting(loaders);
    const webSearchRecord = await loaders.getSetting(SYSTEM_SETTING_KEYS.webSearch);
    const webSearch = webSearchRecord ? sanitizeWebSearchSetting(webSearchRecord.value) : null;
    return {
      ...mergeRuntimeWebSearchConfig(baseConfig, webSearch),
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
        const webSearch = await getStoredWebSearchSystemSetting();
        const sensitiveInformationPolicy = await getStoredSensitiveInformationPolicySystemSetting();
        return res.json({ memory, webSearch, sensitiveInformationPolicy });
      } catch (error) {
        return handleAdminSystemSettingsError(error, res, '[getAdminSystemSettings]');
      }
    },
    updateAdminWebSearchSystemSetting: async (req: Request, res: Response) => {
      try {
        const webSearch = normalizeWebSearchSetting(req.body);

        const updated = await AdminSystemSetting.findOneAndUpdate(
          { key: SYSTEM_SETTING_KEYS.webSearch },
          { value: webSearch },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean<AdminSystemSettingRecord | null>();

        if (!updated) {
          throw createStatusError(500, 'Failed to update web search system setting');
        }

        await options.refreshRuntimeConfig?.();
        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.webSearch,
          action: 'system_setting.web_search.update',
          result: 'success',
          message: 'Updated web search system setting',
          metadata: {
            searchProvider: webSearch.searchProvider,
            scraperProvider: webSearch.scraperProvider,
            rerankerType: webSearch.rerankerType,
          },
        });

        return res.json({ webSearch: sanitizeWebSearchSetting(updated.value) });
      } catch (error) {
        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.webSearch,
          action: 'system_setting.web_search.update',
          result: 'failure',
          message:
            error instanceof Error ? error.message : 'Failed to update web search system setting',
        });
        return handleAdminSystemSettingsError(error, res, '[updateAdminWebSearchSystemSetting]');
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
    updateAdminSensitiveInformationPolicySystemSetting: async (req: Request, res: Response) => {
      try {
        const sensitiveInformationPolicy = normalizeSensitiveInformationPolicySetting(req.body);

        const updated = await AdminSystemSetting.findOneAndUpdate(
          { key: SYSTEM_SETTING_KEYS.sensitiveInformationPolicy },
          { value: sensitiveInformationPolicy },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean<AdminSystemSettingRecord | null>();

        if (!updated) {
          throw createStatusError(500, 'Failed to update sensitive information policy setting');
        }

        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.sensitiveInformationPolicy,
          action: 'system_setting.sensitive_information_policy.update',
          result: 'success',
          message: 'Updated sensitive information policy setting',
          metadata: {
            enabled: sensitiveInformationPolicy.enabled,
            windowType: sensitiveInformationPolicy.window.type,
            durationDays: Number(sensitiveInformationPolicy.window.durationDays ?? 1),
          },
        });

        return res.json({
          sensitiveInformationPolicy: sanitizeSensitiveInformationPolicySetting(updated.value),
        });
      } catch (error) {
        await writeRequestActivityLog(req, {
          resourceType: 'system_setting',
          resourceId: SYSTEM_SETTING_KEYS.sensitiveInformationPolicy,
          action: 'system_setting.sensitive_information_policy.update',
          result: 'failure',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to update sensitive information policy setting',
        });
        return handleAdminSystemSettingsError(
          error,
          res,
          '[updateAdminSensitiveInformationPolicySystemSetting]',
        );
      }
    },
  };
}
