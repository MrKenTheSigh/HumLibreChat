import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import type { AppConfig, IBalance } from '@librechat/data-schemas';
import { getBalanceConfig } from '~/app/config';
import { createStatusError } from './utils';

const { User, AdminPlan, Balance, Transaction } = createModels(mongoose);

export type ProvisioningSource = 'plan_assignment_auto_seed' | 'admin_manual_apply';

export type ProvisioningReason =
  | 'applied'
  | 'already_applied_for_current_plan'
  | 'balance_disabled'
  | 'existing_balance_record'
  | 'no_plan'
  | 'plan_has_no_starting_credits';

export type AdminUserProvisioningState = {
  balanceEnabled: boolean;
  hasBalanceRecord: boolean;
  currentPlanStartingCredits: number | null;
  appliedAt: string | null;
  appliedPlanId: string | null;
  appliedAmount: number | null;
  appliedSource: ProvisioningSource | null;
  appliedPlanMatchesCurrent: boolean;
  canApplyStartingCredits: boolean;
};

export type ApplyStartingCreditsResult = {
  applied: boolean;
  reason: ProvisioningReason;
  tokenCredits: number;
  provisioning: AdminUserProvisioningState;
};

type ProvisioningUserRecord = {
  _id: mongoose.Types.ObjectId | string;
  adminPlanId?: mongoose.Types.ObjectId | string | null;
  adminPlanStartingCreditsAppliedAt?: Date | null;
  adminPlanStartingCreditsAppliedPlanId?: mongoose.Types.ObjectId | string | null;
  adminPlanStartingCreditsAppliedAmount?: number | null;
  adminPlanStartingCreditsAppliedSource?: ProvisioningSource | null;
};

type ProvisioningPlanRecord = {
  _id: mongoose.Types.ObjectId | string;
  startingCredits?: number | null;
};

type BalanceUpdateRecord = {
  tokenCredits: number;
};

type BalanceLike = {
  tokenCredits?: number;
  tokenCreditsLimit?: number;
  planTokenCredits?: number;
  planTokenCreditsLimit?: number;
} | null;

type ProvisioningLoaders = {
  getUserById: (
    userId: mongoose.Types.ObjectId | string,
  ) => Promise<ProvisioningUserRecord | null>;
  getPlanById: (
    planId: mongoose.Types.ObjectId | string,
  ) => Promise<ProvisioningPlanRecord | null>;
  getBalanceByUserId: (
    userId: mongoose.Types.ObjectId | string,
  ) => Promise<IBalance | null>;
  replacePlanBalance: (params: {
    userId: mongoose.Types.ObjectId | string;
    nextPlanCredits: number;
  }) => Promise<BalanceUpdateRecord | null>;
  updateUserProvisioningMetadata: (params: {
    userId: mongoose.Types.ObjectId | string;
    planId: mongoose.Types.ObjectId | string;
    amount: number;
    source: ProvisioningSource;
    appliedAt: Date;
  }) => Promise<void>;
  createTransaction: (params: {
    userId: mongoose.Types.ObjectId | string;
    amount: number;
    source: ProvisioningSource;
  }) => Promise<void>;
};

type ResolveProvisioningStateParams = {
  appConfig?: AppConfig;
  userId: mongoose.Types.ObjectId | string;
};

type ApplyStartingCreditsParams = ResolveProvisioningStateParams & {
  source: ProvisioningSource;
  onlyIfNoBalanceRecord: boolean;
};

function createDefaultLoaders(): ProvisioningLoaders {
  return {
    getUserById: async (userId) =>
      User.findById(userId)
        .select(
          '_id adminPlanId adminPlanStartingCreditsAppliedAt adminPlanStartingCreditsAppliedPlanId adminPlanStartingCreditsAppliedAmount adminPlanStartingCreditsAppliedSource',
        )
        .lean<ProvisioningUserRecord | null>(),
    getPlanById: async (planId) =>
      AdminPlan.findById(planId).select('_id startingCredits').lean<ProvisioningPlanRecord | null>(),
    getBalanceByUserId: async (userId) => Balance.findOne({ user: userId }).lean<IBalance | null>(),
    replacePlanBalance: async ({ userId, nextPlanCredits }) => {
      const currentBalance = await Balance.findOne({ user: userId }).lean<IBalance | null>();
      const currentTokenCredits = getBalanceNumber(currentBalance?.tokenCredits);
      const currentTokenCreditsLimit = getBalanceNumber(currentBalance?.tokenCreditsLimit);
      const currentPlanCredits = getBalanceNumber(currentBalance?.planTokenCredits);
      const currentPlanCreditsLimit = getBalanceNumber(currentBalance?.planTokenCreditsLimit);
      const safeNextPlanCredits = Math.max(nextPlanCredits, 0);
      const balance = await Balance.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            tokenCredits: Math.max(
              0,
              currentTokenCredits + (safeNextPlanCredits - currentPlanCredits),
            ),
            tokenCreditsLimit: Math.max(
              0,
              currentTokenCreditsLimit + (safeNextPlanCredits - currentPlanCreditsLimit),
            ),
            planTokenCredits: safeNextPlanCredits,
            planTokenCreditsLimit: safeNextPlanCredits,
          },
        },
        { new: true, upsert: true },
      ).lean<IBalance | null>();

      return {
        tokenCredits: getUpdatedTokenCredits(balance as BalanceLike),
      };
    },
    updateUserProvisioningMetadata: async ({ userId, planId, amount, source, appliedAt }) => {
      await User.findByIdAndUpdate(userId, {
        $set: {
          adminPlanStartingCreditsAppliedAt: appliedAt,
          adminPlanStartingCreditsAppliedPlanId: planId,
          adminPlanStartingCreditsAppliedAmount: amount,
          adminPlanStartingCreditsAppliedSource: source,
        },
      });
    },
    createTransaction: async ({ userId, amount, source }) => {
      if (amount === 0) {
        return;
      }

      await Transaction.create({
        user: userId,
        tokenType: 'credits',
        context: source,
        rawAmount: amount,
        tokenValue: amount,
      });
    },
  };
}

function toIdString(value: mongoose.Types.ObjectId | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const id = value.toString();
  return id.length > 0 ? id : null;
}

function getStartingCredits(plan: ProvisioningPlanRecord | null): number | null {
  return typeof plan?.startingCredits === 'number' && plan.startingCredits > 0
    ? plan.startingCredits
    : null;
}

function getBalanceEnabled(appConfig?: AppConfig): boolean {
  return getBalanceConfig(appConfig)?.enabled === true;
}

function getTokenCredits(balance: IBalance | null): number {
  return balance?.tokenCredits ?? 0;
}

function getBalanceNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getUpdatedTokenCredits(balance: BalanceLike): number {
  return typeof balance?.tokenCredits === 'number' ? balance.tokenCredits : 0;
}

function toIsoString(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function buildProvisioningState(params: {
  appConfig?: AppConfig;
  user: ProvisioningUserRecord;
  plan: ProvisioningPlanRecord | null;
  balance: IBalance | null;
}): AdminUserProvisioningState {
  const { appConfig, user, plan, balance } = params;
  const currentPlanId = toIdString(plan?._id);
  const appliedPlanId = toIdString(user.adminPlanStartingCreditsAppliedPlanId);
  const currentPlanStartingCredits = getStartingCredits(plan);
  const appliedPlanMatchesCurrent =
    currentPlanId != null && appliedPlanId != null && currentPlanId === appliedPlanId;
  const balanceEnabled = getBalanceEnabled(appConfig);
  const hasBalanceRecord = balance != null;

  return {
    balanceEnabled,
    hasBalanceRecord,
    currentPlanStartingCredits,
    appliedAt: toIsoString(user.adminPlanStartingCreditsAppliedAt),
    appliedPlanId,
    appliedAmount:
      typeof user.adminPlanStartingCreditsAppliedAmount === 'number'
        ? user.adminPlanStartingCreditsAppliedAmount
        : null,
    appliedSource: user.adminPlanStartingCreditsAppliedSource ?? null,
    appliedPlanMatchesCurrent,
    canApplyStartingCredits:
      balanceEnabled &&
      currentPlanId != null &&
      currentPlanStartingCredits != null &&
      appliedPlanMatchesCurrent !== true,
  };
}

async function loadProvisioningContext(
  params: ResolveProvisioningStateParams,
  loaders: ProvisioningLoaders,
) {
  const user = await loaders.getUserById(params.userId);
  if (user == null) {
    throw createStatusError(404, 'User not found');
  }

  const planId = toIdString(user.adminPlanId);
  const [plan, balance] = await Promise.all([
    planId != null ? loaders.getPlanById(planId) : Promise.resolve(null),
    loaders.getBalanceByUserId(params.userId),
  ]);

  return { user, plan, balance };
}

export function createResolveProvisioningState(loaders: ProvisioningLoaders = createDefaultLoaders()) {
  return async function resolveProvisioningState(
    params: ResolveProvisioningStateParams,
  ): Promise<AdminUserProvisioningState> {
    const { user, plan, balance } = await loadProvisioningContext(params, loaders);
    return buildProvisioningState({
      appConfig: params.appConfig,
      user,
      plan,
      balance,
    });
  };
}

export function createApplyStartingCredits(loaders: ProvisioningLoaders = createDefaultLoaders()) {
  const resolveProvisioningState = createResolveProvisioningState(loaders);

  return async function applyStartingCredits(
    params: ApplyStartingCreditsParams,
  ): Promise<ApplyStartingCreditsResult> {
    const { user, plan, balance } = await loadProvisioningContext(params, loaders);
    const initialState = buildProvisioningState({
      appConfig: params.appConfig,
      user,
      plan,
      balance,
    });
    const tokenCredits = getTokenCredits(balance);

    if (initialState.balanceEnabled !== true) {
      return {
        applied: false,
        reason: 'balance_disabled',
        tokenCredits,
        provisioning: initialState,
      };
    }

    if (plan == null) {
      return {
        applied: false,
        reason: 'no_plan',
        tokenCredits,
        provisioning: initialState,
      };
    }

    if (initialState.currentPlanStartingCredits == null) {
      return {
        applied: false,
        reason: 'plan_has_no_starting_credits',
        tokenCredits,
        provisioning: initialState,
      };
    }

    if (initialState.appliedPlanMatchesCurrent === true) {
      return {
        applied: false,
        reason: 'already_applied_for_current_plan',
        tokenCredits,
        provisioning: initialState,
      };
    }

    if (params.onlyIfNoBalanceRecord && initialState.hasBalanceRecord) {
      return {
        applied: false,
        reason: 'existing_balance_record',
        tokenCredits,
        provisioning: initialState,
      };
    }

    const appliedAt = new Date();
    const amount = initialState.currentPlanStartingCredits;
    const updatedBalance = await loaders.replacePlanBalance({
      userId: user._id,
      nextPlanCredits: amount,
    });

    await Promise.all([
      loaders.updateUserProvisioningMetadata({
        userId: user._id,
        planId: plan._id,
        amount,
        source: params.source,
        appliedAt,
      }),
      loaders.createTransaction({
        userId: user._id,
        amount,
        source: params.source,
      }),
    ]);

    const provisioning = await resolveProvisioningState({
      appConfig: params.appConfig,
      userId: user._id,
    });

    return {
      applied: true,
      reason: 'applied',
      tokenCredits: updatedBalance?.tokenCredits ?? tokenCredits + amount,
      provisioning,
    };
  };
}

export const resolveProvisioningState = createResolveProvisioningState();
export const applyStartingCredits = createApplyStartingCredits();
