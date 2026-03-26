import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import { createStatusError } from './utils';

const { User, AdminPlan, AdminChannel } = createModels(mongoose);

export type EntitlementScope =
  | 'admin_bypass'
  | 'assigned_plan'
  | 'default_plan'
  | 'unrestricted'
  | 'invalid_plan';

export type EntitlementPlanSummary = {
  id: string;
  name: string;
  slug: string;
};

export type EntitlementChannel = {
  id: string;
  name: string;
  slug: string;
};

export type EntitlementPair = {
  endpoint: string;
  model: string;
  channelId: string;
  channelSlug: string;
};

export type ResolvedEntitlements = {
  userId: string;
  scope: EntitlementScope;
  plan: EntitlementPlanSummary | null;
  allowedChannels: EntitlementChannel[];
  allowedPairs: EntitlementPair[];
  isRestricted: boolean;
};

export type UserEntitlementsResponse = Omit<ResolvedEntitlements, 'userId'>;

type UserAccessRecord = Pick<IUser, 'role' | 'adminPlanId'> & {
  _id: mongoose.Types.ObjectId | string;
};

type AdminPlanAccessRecord = {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  slug: string;
  enabled?: boolean;
  channelIds?: string[];
};

type AdminChannelEntryRecord = {
  endpoint: string;
  model: string;
  enabled?: boolean;
};

type AdminChannelAccessRecord = {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  slug: string;
  enabled?: boolean;
  entries: AdminChannelEntryRecord[];
};

type AccessLoaders = {
  getUserById: (userId: string) => Promise<UserAccessRecord | null>;
  getAssignedPlan: (
    planId: mongoose.Types.ObjectId | string,
  ) => Promise<AdminPlanAccessRecord | null>;
  getDefaultPlan: () => Promise<AdminPlanAccessRecord | null>;
  getChannelsByIds: (channelIds: string[]) => Promise<AdminChannelAccessRecord[]>;
};

type RequestUser = {
  _id?: mongoose.Types.ObjectId | string;
  id?: string;
  role?: string | null;
};

function toIdString(value: mongoose.Types.ObjectId | string | null | undefined): string {
  if (value == null) {
    return '';
  }

  return value.toString();
}

function toPlanSummary(plan: AdminPlanAccessRecord | null): EntitlementPlanSummary | null {
  if (plan == null) {
    return null;
  }

  return {
    id: toIdString(plan._id),
    name: plan.name,
    slug: plan.slug,
  };
}

function createResolvedEntitlements(
  userId: string,
  scope: EntitlementScope,
  plan: EntitlementPlanSummary | null,
  allowedChannels: EntitlementChannel[],
  allowedPairs: EntitlementPair[],
): ResolvedEntitlements {
  return {
    userId,
    scope,
    plan,
    allowedChannels,
    allowedPairs,
    isRestricted: scope === 'assigned_plan' || scope === 'default_plan' || scope === 'invalid_plan',
  };
}

function sanitizeResolvedEntitlements(
  entitlements: ResolvedEntitlements,
): UserEntitlementsResponse {
  const { userId: _userId, ...response } = entitlements;
  return response;
}

function getRequestUserId(user: RequestUser | undefined): string {
  if (typeof user?.id === 'string' && user.id.length > 0) {
    return user.id;
  }

  return toIdString(user?._id);
}

function buildPlanEntitlements(
  userId: string,
  scope: Extract<EntitlementScope, 'assigned_plan' | 'default_plan'>,
  plan: AdminPlanAccessRecord,
  channels: AdminChannelAccessRecord[],
): ResolvedEntitlements {
  const allowedChannels: EntitlementChannel[] = [];
  const allowedPairs: EntitlementPair[] = [];
  const seenChannels = new Set<string>();
  const seenPairs = new Set<string>();
  const channelMap = new Map(channels.map((channel) => [toIdString(channel._id), channel]));

  for (const channelId of plan.channelIds ?? []) {
    const channel = channelMap.get(channelId);
    if (channel == null || channel.enabled !== true) {
      continue;
    }

    const normalizedChannelId = toIdString(channel._id);
    if (seenChannels.has(normalizedChannelId) !== true) {
      seenChannels.add(normalizedChannelId);
      allowedChannels.push({
        id: normalizedChannelId,
        name: channel.name,
        slug: channel.slug,
      });
    }

    for (const entry of channel.entries ?? []) {
      if (entry.enabled !== true) {
        continue;
      }

      const pairKey = `${entry.endpoint}::${entry.model}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }

      seenPairs.add(pairKey);
      allowedPairs.push({
        endpoint: entry.endpoint,
        model: entry.model,
        channelId: normalizedChannelId,
        channelSlug: channel.slug,
      });
    }
  }

  return createResolvedEntitlements(
    userId,
    scope,
    toPlanSummary(plan),
    allowedChannels,
    allowedPairs,
  );
}

function createDefaultLoaders(): AccessLoaders {
  return {
    getUserById: async (userId) =>
      User.findById(userId).select('_id role adminPlanId').lean<UserAccessRecord | null>(),
    getAssignedPlan: async (planId) =>
      AdminPlan.findById(planId)
        .select('_id name slug enabled channelIds')
        .lean<AdminPlanAccessRecord | null>(),
    getDefaultPlan: async () =>
      AdminPlan.findOne({ enabled: true, isDefault: true })
        .sort({ sortOrder: 1, name: 1, _id: 1 })
        .select('_id name slug enabled channelIds')
        .lean<AdminPlanAccessRecord | null>(),
    getChannelsByIds: async (channelIds) => {
      if (channelIds.length === 0) {
        return [];
      }

      return AdminChannel.find({
        _id: { $in: channelIds },
      })
        .select('_id name slug enabled entries')
        .lean<AdminChannelAccessRecord[]>();
    },
  };
}

export function createResolveUserEntitlements(loaders: AccessLoaders = createDefaultLoaders()) {
  return async function resolveUserEntitlements(params: {
    userId: string;
    role?: string | null;
  }): Promise<ResolvedEntitlements> {
    const { userId, role } = params;
    if (role === SystemRoles.ADMIN) {
      return createResolvedEntitlements(userId, 'admin_bypass', null, [], []);
    }

    const user = await loaders.getUserById(userId);
    if (user == null) {
      throw createStatusError(404, 'User not found');
    }

    if (user.role === SystemRoles.ADMIN) {
      return createResolvedEntitlements(userId, 'admin_bypass', null, [], []);
    }

    const assignedPlanId = toIdString(user.adminPlanId);
    if (assignedPlanId.length > 0) {
      const assignedPlan = await loaders.getAssignedPlan(user.adminPlanId ?? assignedPlanId);
      if (assignedPlan == null || assignedPlan.enabled !== true) {
        return createResolvedEntitlements(
          userId,
          'invalid_plan',
          toPlanSummary(assignedPlan),
          [],
          [],
        );
      }

      const channels = await loaders.getChannelsByIds(assignedPlan.channelIds ?? []);
      return buildPlanEntitlements(userId, 'assigned_plan', assignedPlan, channels);
    }

    const defaultPlan = await loaders.getDefaultPlan();
    if (defaultPlan == null) {
      return createResolvedEntitlements(userId, 'unrestricted', null, [], []);
    }

    const channels = await loaders.getChannelsByIds(defaultPlan.channelIds ?? []);
    return buildPlanEntitlements(userId, 'default_plan', defaultPlan, channels);
  };
}

export const resolveUserEntitlements = createResolveUserEntitlements();

export function isPairAllowed(
  entitlements: ResolvedEntitlements,
  endpoint: string,
  model: string,
): boolean {
  if (entitlements.isRestricted !== true) {
    return true;
  }

  return entitlements.allowedPairs.some(
    (pair) => pair.endpoint === endpoint && pair.model === model,
  );
}

export function createGetUserEntitlements(
  resolve: typeof resolveUserEntitlements = resolveUserEntitlements,
) {
  return async function getUserEntitlements(req: Request, res: Response) {
    const user = req.user as RequestUser | undefined;
    const userId = getRequestUserId(user);

    if (userId.length === 0) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const entitlements = await resolve({
        userId,
        role: user?.role,
      });

      return res.status(200).json(sanitizeResolvedEntitlements(entitlements));
    } catch (error) {
      const statusCode =
        error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;

      const message =
        error instanceof Error ? error.message : 'An unexpected entitlement error occurred';

      return res.status(statusCode).json({ message });
    }
  };
}

export const getUserEntitlements = createGetUserEntitlements();
