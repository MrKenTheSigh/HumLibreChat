import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, createMethods, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { SystemRoles } from 'librechat-data-provider';
import type { AppConfig, IUser, IBalance, IRole } from '@librechat/data-schemas';
import { getBalanceConfig } from '~/app/config';
import type { AdminUserProvisioningState } from './provisioning';
import { applyStartingCredits, resolveProvisioningState } from './provisioning';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parseOptionalBoolean,
  parsePageSize,
  trimSearch,
} from './utils';

const { User, Balance, Transaction, Role } = createModels(mongoose);
const { createUser, updateBalance } = createMethods(mongoose);

const MIN_PASSWORD_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH ?? '', 10) || 8;
const allowedCharactersRegex = new RegExp(
  '^[' +
    'a-zA-Z0-9_.@#$%&*()' +
    '\\p{Script=Latin}' +
    '\\p{Script=Common}' +
    '\\p{Script=Cyrillic}' +
    '\\p{Script=Devanagari}' +
    '\\p{Script=Han}' +
    '\\p{Script=Arabic}' +
    '\\p{Script=Hiragana}' +
    '\\p{Script=Katakana}' +
    '\\p{Script=Hangul}' +
    ']+$',
  'u',
);
const injectionPatternsRegex = /('|--|\$ne|\$gt|\$lt|\$or|\{|\}|\*|;|<|>|\/|=)/i;

type BcryptModule = {
  genSaltSync: (rounds?: number) => string;
  hashSync: (value: string, salt: string) => string;
};

const bcrypt = require('bcryptjs') as BcryptModule;

const usernameSchema = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(80, 'Username must be less than 80 characters')
  .refine((value) => allowedCharactersRegex.test(value), {
    message: 'Invalid characters in username',
  })
  .refine((value) => !injectionPatternsRegex.test(value), {
    message: 'Potential injection attack detected',
  });

const adminCreateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(80, 'Name must be less than 80 characters'),
  username: z
    .union([z.literal(''), usernameSchema])
    .transform((value) => (value === '' ? null : value))
    .optional()
    .nullable(),
  email: z.string().trim().email('Email must be a valid email address'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(128, 'Password must be less than 128 characters')
    .refine((value) => value.trim().length > 0, {
      message: 'Password cannot be only spaces',
    }),
  emailVerified: z.boolean().optional().default(true),
  role: z.string().trim().min(1, 'Role is required').optional().default(SystemRoles.USER),
});

const adminUserRoleAssignSchema = z.object({
  roleName: z.string().trim().min(1, 'roleName is required'),
});

const adminUserPlanAssignSchema = z.object({
  planId: z.string().trim().min(1, 'planId is required'),
});

const adminBalanceAddSchema = z.object({
  amount: z
    .coerce.number()
    .finite('amount must be a finite number')
    .int('amount must be an integer')
    .positive('amount must be greater than 0'),
});

const adminBalanceSetSchema = z.object({
  amount: z
    .coerce.number()
    .finite('amount must be a finite number')
    .int('amount must be an integer')
    .min(0, 'amount must be greater than or equal to 0'),
});

type AdminUserListItem = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  username?: string;
  email: string;
  role?: string;
  provider: string;
  emailVerified: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminUserDetailRecord = AdminUserListItem & {
  termsAccepted?: boolean;
  plugins?: string[];
  adminPlanId?: mongoose.Types.ObjectId | null;
  adminPlanAssignedAt?: Date | null;
  adminPlanStartingCreditsAppliedAt?: Date | null;
  adminPlanStartingCreditsAppliedPlanId?: mongoose.Types.ObjectId | null;
  adminPlanStartingCreditsAppliedAmount?: number | null;
  adminPlanStartingCreditsAppliedSource?: 'plan_assignment_auto_seed' | 'admin_manual_apply' | null;
  personalization?: {
    memories?: boolean;
  };
  favorites?: Array<{
    agentId?: string;
    model?: string;
    endpoint?: string;
  }>;
};

type AdminBalanceRecord = {
  tokenCredits: number;
};

type AdminPlanSummaryRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  startingCredits?: number | null;
};

type AppAwareRequest = Request & {
  config?: AppConfig;
};

type PrimaryAdminRecord = {
  _id: mongoose.Types.ObjectId;
};

function normalizeUsername(email: string, username: string | null | undefined): string {
  const normalized = username?.trim().toLowerCase();
  if (normalized != null && normalized.length > 0) {
    return normalized;
  }

  return email.split('@')[0].trim().toLowerCase();
}

function normalizeRoleName(roleName: string): string {
  return roleName.trim().toUpperCase();
}

function sanitizeUserListItem(user: AdminUserListItem) {
  return {
    id: user._id.toString(),
    name: user.name ?? null,
    username: user.username ?? null,
    email: user.email,
    role: user.role ?? null,
    provider: user.provider,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    createdAt: user.createdAt?.toISOString() ?? null,
    updatedAt: user.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeUserDetail(
  user: AdminUserDetailRecord,
  balance: IBalance | null,
  plan: AdminPlanSummaryRecord | null,
  provisioning: AdminUserProvisioningState,
  roleManagement: {
    isPrimaryAdminProtected: boolean;
    canChangeRole: boolean;
    canDelete: boolean;
  },
) {
  const base = sanitizeUserListItem(user);
  return {
    ...base,
    termsAccepted: user.termsAccepted ?? false,
    favoritesCount: user.favorites?.length ?? 0,
    plugins: user.plugins ?? [],
    roleManagement,
    personalization: {
      memories: user.personalization?.memories ?? true,
    },
    plan: plan
      ? {
          id: plan._id.toString(),
          name: plan.name,
          slug: plan.slug,
          startingCredits: typeof plan.startingCredits === 'number' ? plan.startingCredits : null,
        }
      : null,
    planAssignedAt: user.adminPlanAssignedAt?.toISOString() ?? null,
    balance: {
      tokenCredits: balance?.tokenCredits ?? 0,
      updatedAt: null,
    },
    provisioning,
  };
}

function extractTokenCredits(balance: unknown): number {
  if (
    balance != null &&
    typeof balance === 'object' &&
    'tokenCredits' in balance &&
    typeof balance.tokenCredits === 'number'
  ) {
    return balance.tokenCredits;
  }

  throw createStatusError(500, 'Failed to read updated balance');
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

export async function getAdminUsers(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const search = trimSearch(req.query.search);
    const role = trimSearch(req.query.role);
    const provider = trimSearch(req.query.provider);
    const emailVerified = parseOptionalBoolean(req.query.emailVerified);
    const cursorFilter = buildCreatedAtCursorFilter<AdminUserListItem>(trimSearch(req.query.cursor));

    const filters: mongoose.FilterQuery<AdminUserListItem>[] = [];

    if (search) {
      const regex = new RegExp(search, 'i');
      filters.push({
        $or: [{ email: regex }, { name: regex }, { username: regex }],
      });
    }

    if (role && role.toLowerCase() !== 'all') {
      filters.push({ role });
    }

    if (provider && provider.toLowerCase() !== 'all') {
      filters.push({ provider });
    }

    if (typeof emailVerified === 'boolean') {
      filters.push({ emailVerified });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const query = filters.length > 0 ? { $and: filters } : {};
    const users = await User.find(query)
      .select(
        '_id name username email role provider emailVerified twoFactorEnabled createdAt updatedAt',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<AdminUserListItem[]>();

    const { items, nextCursor } = buildPagedResult<AdminUserListItem>(users, limit);

    return res.status(200).json({
      users: items.map(sanitizeUserListItem),
      nextCursor,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUsers]');
  }
}

export async function createAdminUser(req: Request, res: Response) {
  try {
    const body = adminCreateUserSchema.parse(req.body);
    const { roleName } = await getExistingRoleOrThrow(body.role);
    const email = body.email.trim().toLowerCase();
    const username = normalizeUsername(email, body.username);
    const existingUserQuery = [{ email }, { username }];
    const existingUser = await User.findOne({ $or: existingUserQuery })
      .select('_id')
      .lean<IUser | null>();

    if (existingUser) {
      throw createStatusError(409, 'A user with that email or username already exists');
    }

    const salt = bcrypt.genSaltSync(10);
    const createdUser = await createUser(
      {
        provider: 'local',
        email,
        username,
        name: body.name.trim(),
        avatar: null,
        role: roleName,
        emailVerified: body.emailVerified,
        password: bcrypt.hashSync(body.password, salt),
      },
      getBalanceConfig((req as AppAwareRequest).config),
      true,
      true,
    );

    return res.status(201).json(sanitizeUserListItem(createdUser as AdminUserListItem));
  } catch (error) {
    return handleAdminError(error, res, '[createAdminUser]');
  }
}

export async function getAdminUser(req: Request, res: Response) {
  try {
    const userId = parseObjectId(req.params.userId, 'userId');
    const user = await User.findById(userId)
      .select(
        '_id name username email role provider emailVerified twoFactorEnabled termsAccepted personalization plugins favorites adminPlanId adminPlanAssignedAt adminPlanStartingCreditsAppliedAt adminPlanStartingCreditsAppliedPlanId adminPlanStartingCreditsAppliedAmount adminPlanStartingCreditsAppliedSource createdAt updatedAt',
      )
      .lean<AdminUserDetailRecord | null>();

    if (!user) {
      throw createStatusError(404, 'User not found');
    }

    const [balance, plan, provisioning, isPrimaryAdminProtected] = await Promise.all([
      Balance.findOne({ user: userId }).lean(),
      user.adminPlanId
        ? User.db
            .model('AdminPlan')
            .findById(user.adminPlanId)
            .select('_id name slug startingCredits')
            .lean<AdminPlanSummaryRecord | null>()
        : Promise.resolve(null),
      resolveProvisioningState({
        appConfig: (req as AppAwareRequest).config,
        userId,
      }),
      isPrimaryAdminUser(userId),
    ]);

    return res.status(200).json(
      sanitizeUserDetail(user, balance as IBalance | null, plan, provisioning, {
        isPrimaryAdminProtected,
        canChangeRole: !isPrimaryAdminProtected,
        canDelete: !isPrimaryAdminProtected,
      }),
    );
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUser]');
  }
}

async function getExistingUserOrThrow(
  userIdParam: string,
): Promise<{ userId: mongoose.Types.ObjectId }> {
  const userId = parseObjectId(userIdParam, 'userId');
  const user = (await User.findById(userId).select('_id email').lean()) as IUser | null;
  if (!user) {
    throw createStatusError(404, 'User not found');
  }
  return { userId };
}

async function getExistingPlanOrThrow(
  planIdParam: string,
): Promise<{ planId: mongoose.Types.ObjectId; plan: AdminPlanSummaryRecord }> {
  const planId = parseObjectId(planIdParam, 'planId');
  const plan = await User.db
    .model('AdminPlan')
    .findById(planId)
    .select('_id name slug')
    .lean<AdminPlanSummaryRecord | null>();

  if (!plan) {
    throw createStatusError(404, 'Plan not found');
  }

  return { planId, plan };
}

async function getExistingRoleOrThrow(
  roleNameParam: string,
): Promise<{ role: IRole; roleName: string }> {
  const roleName = normalizeRoleName(roleNameParam);
  const role = await Role.findOne({ name: roleName }).lean<IRole | null>();

  if (!role) {
    throw createStatusError(404, 'Role not found');
  }

  return { role, roleName };
}

async function getPrimaryAdminUserId(): Promise<mongoose.Types.ObjectId | null> {
  const adminUsers = await User.find({ role: SystemRoles.ADMIN })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .limit(1)
    .lean<PrimaryAdminRecord[]>();

  return adminUsers[0]?._id ?? null;
}

async function isPrimaryAdminUser(userId: mongoose.Types.ObjectId): Promise<boolean> {
  const primaryAdminUserId = await getPrimaryAdminUserId();
  return primaryAdminUserId?.equals(userId) === true;
}

function sanitizePlanAssignment(
  userId: mongoose.Types.ObjectId,
  plan: AdminPlanSummaryRecord | null,
  assignedAt: Date | null,
) {
  return {
    userId: userId.toString(),
    plan: plan
      ? {
          id: plan._id.toString(),
          name: plan.name,
          slug: plan.slug,
        }
      : null,
    assignedAt: assignedAt?.toISOString() ?? null,
  };
}

async function createAdminBalanceTransaction(
  userId: mongoose.Types.ObjectId,
  amount: number,
  context: string,
) {
  if (amount === 0) {
    return;
  }

  await Transaction.create({
    user: userId,
    tokenType: 'credits',
    context,
    rawAmount: amount,
    tokenValue: amount,
  });
}

export async function addAdminUserBalance(req: Request, res: Response) {
  try {
    const { amount } = adminBalanceAddSchema.parse(req.body);
    const { userId } = await getExistingUserOrThrow(req.params.userId);

    const updatedBalance = await updateBalance({
      user: userId.toString(),
      incrementValue: amount,
    });

    await createAdminBalanceTransaction(userId, amount, 'admin_add');

    return res.status(200).json({
      userId: userId.toString(),
      tokenCredits: extractTokenCredits(updatedBalance),
      updatedAt: null,
    });
  } catch (error) {
    return handleAdminError(error, res, '[addAdminUserBalance]');
  }
}

export async function setAdminUserBalance(req: Request, res: Response) {
  try {
    const { amount } = adminBalanceSetSchema.parse(req.body);
    const { userId } = await getExistingUserOrThrow(req.params.userId);

    const currentBalance = (await Balance.findOne({ user: userId }).lean()) as IBalance | null;
    const currentCredits = currentBalance?.tokenCredits ?? 0;
    const delta = amount - currentCredits;

    const updatedBalance = await Balance.findOneAndUpdate(
      { user: userId },
      { $set: { tokenCredits: amount } },
      { upsert: true, new: true },
    ).lean<AdminBalanceRecord | null>();

    if (!updatedBalance) {
      throw createStatusError(500, 'Failed to update balance');
    }

    await createAdminBalanceTransaction(userId, delta, 'admin_set');

    return res.status(200).json({
      userId: userId.toString(),
      tokenCredits: updatedBalance.tokenCredits,
      updatedAt: null,
    });
  } catch (error) {
    return handleAdminError(error, res, '[setAdminUserBalance]');
  }
}

export async function assignAdminUserPlan(req: Request, res: Response) {
  try {
    const { planId: planIdParam } = adminUserPlanAssignSchema.parse(req.body);
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const { planId, plan } = await getExistingPlanOrThrow(planIdParam);
    const assignedAt = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          adminPlanId: planId,
          adminPlanAssignedAt: assignedAt,
        },
      },
      { new: true },
    )
      .select('_id adminPlanAssignedAt')
      .lean<{ _id: mongoose.Types.ObjectId; adminPlanAssignedAt?: Date | null } | null>();

    if (!updatedUser) {
      throw createStatusError(404, 'User not found');
    }

    await applyStartingCredits({
      appConfig: (req as AppAwareRequest).config,
      userId,
      source: 'plan_assignment_auto_seed',
      onlyIfNoBalanceRecord: true,
    });

    return res
      .status(200)
      .json(sanitizePlanAssignment(userId, plan, updatedUser.adminPlanAssignedAt ?? assignedAt));
  } catch (error) {
    return handleAdminError(error, res, '[assignAdminUserPlan]');
  }
}

export async function clearAdminUserPlan(req: Request, res: Response) {
  try {
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          adminPlanId: null,
          adminPlanAssignedAt: null,
        },
      },
      { new: true },
    )
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId } | null>();

    if (!updatedUser) {
      throw createStatusError(404, 'User not found');
    }

    return res.status(200).json(sanitizePlanAssignment(userId, null, null));
  } catch (error) {
    return handleAdminError(error, res, '[clearAdminUserPlan]');
  }
}

export async function applyAdminUserPlanStartingCredits(req: Request, res: Response) {
  try {
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const result = await applyStartingCredits({
      appConfig: (req as AppAwareRequest).config,
      userId,
      source: 'admin_manual_apply',
      onlyIfNoBalanceRecord: false,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleAdminError(error, res, '[applyAdminUserPlanStartingCredits]');
  }
}

export async function updateAdminUserRole(req: Request, res: Response) {
  try {
    const { roleName: roleNameParam } = adminUserRoleAssignSchema.parse(req.body);
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const { roleName } = await getExistingRoleOrThrow(roleNameParam);
    const existingUser = await User.findById(userId)
      .select('_id role')
      .lean<{ _id: mongoose.Types.ObjectId; role?: string | null } | null>();

    if (!existingUser) {
      throw createStatusError(404, 'User not found');
    }

    if ((await isPrimaryAdminUser(userId)) && roleName !== SystemRoles.ADMIN) {
      throw createStatusError(403, 'Cannot change the role of the primary ADMIN user');
    }

    if (existingUser.role === SystemRoles.ADMIN && roleName !== SystemRoles.ADMIN) {
      const adminCount = await User.countDocuments({ role: SystemRoles.ADMIN });
      if (adminCount <= 1) {
        throw createStatusError(409, 'Cannot remove the last remaining ADMIN user');
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          role: roleName,
        },
      },
      { new: true },
    )
      .select('_id role')
      .lean<{ _id: mongoose.Types.ObjectId; role?: string | null } | null>();

    if (!updatedUser || !updatedUser.role) {
      throw createStatusError(404, 'User not found');
    }

    return res.status(200).json({
      userId: userId.toString(),
      role: updatedUser.role,
    });
  } catch (error) {
    return handleAdminError(error, res, '[updateAdminUserRole]');
  }
}
