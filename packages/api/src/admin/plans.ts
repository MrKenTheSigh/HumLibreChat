import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { createStatusError, parseObjectId } from './utils';

const { AdminPlan } = createModels(mongoose);

const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const adminPlanInputSchema = z.object({
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
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int('sortOrder must be an integer').optional().default(0),
  channelIds: z.array(z.string()).optional().default([]),
  modelEntitlements: z
    .array(
      z.object({
        channelId: z.string().trim().optional().default(''),
        endpoint: z.string().trim().min(1, 'model entitlements require an endpoint'),
        model: z.string().trim().min(1, 'model entitlements require a model'),
      }),
    )
    .optional()
    .default([]),
  notes: z.string().trim().optional().default(''),
  startingCredits: z.number().int().min(0).nullable().optional().default(null),
});

type AdminPlanModelEntitlementRecord = {
  channelId: string;
  endpoint: string;
  model: string;
};

type RawAdminPlanModelEntitlementRecord = Partial<AdminPlanModelEntitlementRecord> | null | undefined;

type AdminPlanRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  channelIds?: string[];
  modelEntitlements?: RawAdminPlanModelEntitlementRecord[];
  notes?: string;
  startingCredits?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminPlanInput = z.infer<typeof adminPlanInputSchema>;

function sanitizeChannelIds(channelIds: string[]): string[] {
  return Array.from(
    new Set(
      channelIds
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0),
    ),
  );
}

function sanitizeModelEntitlements(
  modelEntitlements: RawAdminPlanModelEntitlementRecord[],
): AdminPlanModelEntitlementRecord[] {
  const seen = new Set<string>();

  return modelEntitlements.reduce<AdminPlanModelEntitlementRecord[]>((records, entitlement) => {
    const channelId = entitlement?.channelId?.trim() ?? '';
    const endpoint = entitlement?.endpoint?.trim() ?? '';
    const model = entitlement?.model?.trim() ?? '';
    if (endpoint.length === 0 || model.length === 0) {
      return records;
    }

    const key = `${channelId}::${endpoint}::${model}`;
    if (seen.has(key)) {
      return records;
    }

    seen.add(key);
    records.push({
      channelId,
      endpoint,
      model,
    });
    return records;
  }, []);
}

function deriveChannelIdsFromModelEntitlements(
  modelEntitlements: AdminPlanModelEntitlementRecord[],
): string[] {
  return sanitizeChannelIds(
    modelEntitlements
      .map((entitlement) => entitlement.channelId?.trim() ?? '')
      .filter((channelId) => channelId.length > 0),
  );
}

function sanitizeAdminPlan(plan: AdminPlanRecord) {
  return {
    id: plan._id.toString(),
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? '',
    enabled: plan.enabled ?? true,
    isDefault: plan.isDefault ?? false,
    sortOrder: plan.sortOrder ?? 0,
    channelIds: plan.channelIds ?? [],
    modelEntitlements: sanitizeModelEntitlements(plan.modelEntitlements ?? []),
    notes: plan.notes ?? '',
    startingCredits: plan.startingCredits ?? null,
    createdAt: plan.createdAt?.toISOString() ?? null,
    updatedAt: plan.updatedAt?.toISOString() ?? null,
  };
}

function parseAdminPlanInput(input: unknown): AdminPlanInput {
  const parsed = adminPlanInputSchema.parse(input);
  const modelEntitlements = sanitizeModelEntitlements(parsed.modelEntitlements);
  return {
    ...parsed,
    channelIds: sanitizeChannelIds([
      ...parsed.channelIds,
      ...deriveChannelIdsFromModelEntitlements(modelEntitlements),
    ]),
    modelEntitlements,
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

async function ensureUniqueSlug(slug: string, planId?: mongoose.Types.ObjectId) {
  const query: mongoose.FilterQuery<AdminPlanRecord> = planId
    ? { slug, _id: { $ne: planId } }
    : { slug };

  const existing = await AdminPlan.findOne(query)
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (existing) {
    throw createStatusError(409, 'A plan with this slug already exists');
  }
}

async function clearOtherDefaultPlans(planId: mongoose.Types.ObjectId) {
  await AdminPlan.updateMany(
    { isDefault: true, _id: { $ne: planId } },
    { $set: { isDefault: false } },
  );
}

async function getPlanOrThrow(planIdParam: string) {
  const planId = parseObjectId(planIdParam, 'planId');
  const plan = await AdminPlan.findById(planId).lean<AdminPlanRecord | null>();
  if (!plan) {
    throw createStatusError(404, 'Plan not found');
  }

  return { planId, plan };
}

async function isPlanAssigned(planId: mongoose.Types.ObjectId): Promise<boolean> {
  const usersCollection = mongoose.connection.db?.collection('users');
  if (!usersCollection) {
    return false;
  }

  const assignedUser = await usersCollection.findOne({
    $or: [{ adminPlanId: planId.toString() }, { adminPlanId: planId }],
  });

  return assignedUser != null;
}

export async function getAdminPlans(_req: Request, res: Response) {
  try {
    const plans = await AdminPlan.find({})
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean<AdminPlanRecord[]>();

    return res.status(200).json({
      plans: plans.map(sanitizeAdminPlan),
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminPlans]');
  }
}

export async function getAdminPlan(req: Request, res: Response) {
  try {
    const { plan } = await getPlanOrThrow(req.params.planId);
    return res.status(200).json(sanitizeAdminPlan(plan));
  } catch (error) {
    return handleAdminError(error, res, '[getAdminPlan]');
  }
}

export async function createAdminPlan(req: Request, res: Response) {
  try {
    const input = parseAdminPlanInput(req.body);
    await ensureUniqueSlug(input.slug);

    const createdPlan = await AdminPlan.create(input);
    const createdId = parseObjectId(createdPlan._id.toString(), 'planId');

    if (input.isDefault) {
      await clearOtherDefaultPlans(createdId);
    }

    const storedPlan = await AdminPlan.findById(createdId).lean<AdminPlanRecord | null>();
    if (!storedPlan) {
      throw createStatusError(500, 'Failed to load created plan');
    }

    return res.status(201).json(sanitizeAdminPlan(storedPlan));
  } catch (error) {
    return handleAdminError(error, res, '[createAdminPlan]');
  }
}

export async function updateAdminPlan(req: Request, res: Response) {
  try {
    const { planId } = await getPlanOrThrow(req.params.planId);
    const input = parseAdminPlanInput(req.body);
    await ensureUniqueSlug(input.slug, planId);

    const updatedPlan = await AdminPlan.findByIdAndUpdate(
      planId,
      { $set: input },
      { new: true },
    ).lean<AdminPlanRecord | null>();
    if (!updatedPlan) {
      throw createStatusError(404, 'Plan not found');
    }

    if (input.isDefault) {
      await clearOtherDefaultPlans(planId);
    }

    const storedPlan = await AdminPlan.findById(planId).lean<AdminPlanRecord | null>();
    if (!storedPlan) {
      throw createStatusError(404, 'Plan not found');
    }

    return res.status(200).json(sanitizeAdminPlan(storedPlan));
  } catch (error) {
    return handleAdminError(error, res, '[updateAdminPlan]');
  }
}

export async function deleteAdminPlan(req: Request, res: Response) {
  try {
    const { planId } = await getPlanOrThrow(req.params.planId);

    if (await isPlanAssigned(planId)) {
      throw createStatusError(409, 'Cannot delete a plan that is assigned to users');
    }

    await AdminPlan.deleteOne({ _id: planId });

    return res.status(200).json({
      id: planId.toString(),
      deleted: true,
    });
  } catch (error) {
    return handleAdminError(error, res, '[deleteAdminPlan]');
  }
}
