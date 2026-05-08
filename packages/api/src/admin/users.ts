import mongoose from 'mongoose';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { createModels, createMethods, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { SystemRoles } from 'librechat-data-provider';
import type { AppConfig, IUser, IBalance } from '@librechat/data-schemas';
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
import { writeRequestActivityLog } from './activityLogs';

const {
  User,
  Balance,
  Transaction,
  Role,
  Department,
  QuotaAccount,
  QuotaLedgerEntry,
  QuotaPeriod,
} = createModels(mongoose);
const { createUser } = createMethods(mongoose);

const COMPANY_DEPARTMENT_CODE = 'COMPANY';
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

type QuotaPeriodRecord = {
  _id: mongoose.Types.ObjectId;
};

type QuotaAccountRecord = {
  _id: mongoose.Types.ObjectId;
  parentAccountId?: mongoose.Types.ObjectId | string | null;
  baseAllocatedCredits: number;
  extraGrantedCredits: number;
  reservedCredits: number;
  usedCredits: number;
  bufferCredits: number;
};

type CompanyRootDepartmentRecord = {
  _id: mongoose.Types.ObjectId;
};

const nodeRequire = createRequire(__filename);
const bcrypt = nodeRequire('bcryptjs') as BcryptModule;

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
    .min(1, 'Name must be at least 1 character')
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

const adminUpdateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name must be at least 1 character')
    .max(80, 'Name must be less than 80 characters'),
});

const adminUserRoleAssignSchema = z.object({
  roleName: z.string().trim().min(1, 'roleName is required'),
});

const adminUserPlanAssignSchema = z.object({
  planId: z.string().trim().min(1, 'planId is required'),
});

const adminUserDepartmentAssignSchema = z.object({
  departmentId: z
    .union([z.string().trim().min(1), z.literal(''), z.null()])
    .optional()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  quotaPeriodId: z
    .union([z.string().trim().min(1), z.literal(''), z.null()])
    .optional()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
});

const adminBalanceAddSchema = z.object({
  amount: z.coerce
    .number()
    .finite('amount must be a finite number')
    .int('amount must be an integer')
    .positive('amount must be greater than 0'),
});

const adminBalanceSetSchema = z.object({
  amount: z.coerce
    .number()
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
  departmentId?: mongoose.Types.ObjectId | null;
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
  departmentId?: mongoose.Types.ObjectId | null;
  departmentAssignedAt?: Date | null;
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
  tokenCreditsLimit?: number;
  planTokenCredits?: number;
  planTokenCreditsLimit?: number;
};

type AdminPlanSummaryRecord = {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  startingCredits?: number | null;
};

type AdminDepartmentSummaryRecord = {
  _id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  enabled?: boolean;
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
    departmentId: user.departmentId?.toString() ?? null,
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
  department: AdminDepartmentSummaryRecord | null,
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
    department: department
      ? {
          id: department._id.toString(),
          code: department.code,
          name: department.name,
          enabled: department.enabled ?? true,
        }
      : null,
    departmentAssignedAt: user.departmentAssignedAt?.toISOString() ?? null,
    balance: {
      tokenCredits: balance?.tokenCredits ?? 0,
      updatedAt: null,
    },
    provisioning,
  };
}

async function writeUserActivityLog(
  req: Request,
  action: string,
  result: 'success' | 'failure',
  userId: string | null,
  message = '',
) {
  await writeRequestActivityLog(req, {
    resourceType: 'user',
    resourceId: userId,
    action,
    result,
    message,
    metadata: userId ? { userId } : {},
  });
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

function getBalanceNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function buildPlanBalanceUpdate(params: {
  balance: AdminBalanceRecord | null;
  nextPlanCredits: number;
}) {
  const currentTokenCredits = getBalanceNumber(params.balance?.tokenCredits);
  const currentTokenCreditsLimit = getBalanceNumber(params.balance?.tokenCreditsLimit);
  const currentPlanCredits = getBalanceNumber(params.balance?.planTokenCredits);
  const currentPlanCreditsLimit = getBalanceNumber(params.balance?.planTokenCreditsLimit);
  const nextPlanCredits = Math.max(params.nextPlanCredits, 0);
  const tokenCreditsDelta = nextPlanCredits - currentPlanCredits;
  const tokenCreditsLimitDelta = nextPlanCredits - currentPlanCreditsLimit;

  return {
    tokenCredits: Math.max(0, currentTokenCredits + tokenCreditsDelta),
    tokenCreditsLimit: Math.max(0, currentTokenCreditsLimit + tokenCreditsLimitDelta),
    planTokenCredits: nextPlanCredits,
    planTokenCreditsLimit: nextPlanCredits,
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

export async function getAdminUsers(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const search = trimSearch(req.query.search);
    const role = trimSearch(req.query.role);
    const provider = trimSearch(req.query.provider);
    const emailVerified = parseOptionalBoolean(req.query.emailVerified);
    const cursorFilter = buildCreatedAtCursorFilter<AdminUserListItem>(
      trimSearch(req.query.cursor),
    );

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
        '_id name username email role provider departmentId emailVerified twoFactorEnabled createdAt updatedAt',
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
        '_id name username email role provider emailVerified twoFactorEnabled termsAccepted personalization plugins favorites adminPlanId adminPlanAssignedAt adminPlanStartingCreditsAppliedAt adminPlanStartingCreditsAppliedPlanId adminPlanStartingCreditsAppliedAmount adminPlanStartingCreditsAppliedSource departmentId departmentAssignedAt createdAt updatedAt',
      )
      .lean<AdminUserDetailRecord | null>();

    if (!user) {
      throw createStatusError(404, 'User not found');
    }

    const [balance, plan, department, provisioning, isPrimaryAdminProtected] = await Promise.all([
      Balance.findOne({ user: userId }).lean(),
      user.adminPlanId
        ? User.db
            .model('AdminPlan')
            .findById(user.adminPlanId)
            .select('_id name slug startingCredits')
            .lean<AdminPlanSummaryRecord | null>()
        : Promise.resolve(null),
      user.departmentId
        ? Department.findById(user.departmentId)
            .select('_id code name enabled')
            .lean<AdminDepartmentSummaryRecord | null>()
        : Promise.resolve(null),
      resolveProvisioningState({
        appConfig: (req as AppAwareRequest).config,
        userId,
      }),
      isPrimaryAdminUser(userId),
    ]);

    return res.status(200).json(
      sanitizeUserDetail(user, balance as IBalance | null, plan, department, provisioning, {
        isPrimaryAdminProtected,
        canChangeRole: !isPrimaryAdminProtected,
        canDelete: !isPrimaryAdminProtected,
      }),
    );
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUser]');
  }
}

export async function updateAdminUser(req: Request, res: Response) {
  try {
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const body = adminUpdateUserSchema.parse(req.body);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { name: body.name.trim() } },
      { new: true },
    )
      .select(
        '_id name username email role provider emailVerified twoFactorEnabled createdAt updatedAt',
      )
      .lean<AdminUserListItem | null>();

    if (!updatedUser) {
      throw createStatusError(404, 'User not found');
    }

    return res.status(200).json(sanitizeUserListItem(updatedUser));
  } catch (error) {
    return handleAdminError(error, res, '[updateAdminUser]');
  }
}

export async function updateAdminUserDepartment(req: Request, res: Response) {
  try {
    const { userId } = await getExistingUserOrThrow(req.params.userId);
    const { departmentId: departmentIdParam, quotaPeriodId } =
      adminUserDepartmentAssignSchema.parse(req.body);
    const assignedAt = departmentIdParam == null ? null : new Date();
    const departmentResult =
      departmentIdParam == null ? null : await getExistingDepartmentOrThrow(departmentIdParam);

    await transferActiveUserQuotaParent({
      req,
      userId,
      targetDepartmentId: departmentResult?.departmentId ?? null,
      quotaPeriodId,
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          departmentId: departmentResult?.departmentId ?? null,
          departmentAssignedAt: assignedAt,
        },
      },
      { new: true },
    )
      .select('_id departmentId departmentAssignedAt')
      .lean<Pick<AdminUserDetailRecord, '_id' | 'departmentId' | 'departmentAssignedAt'> | null>();

    if (!updatedUser) {
      throw createStatusError(404, 'User not found');
    }

    await writeUserActivityLog(req, 'user.department.update', 'success', userId.toString());

    return res.status(200).json({
      userId: userId.toString(),
      department: departmentResult
        ? {
            id: departmentResult.department._id.toString(),
            code: departmentResult.department.code,
            name: departmentResult.department.name,
            enabled: departmentResult.department.enabled ?? true,
          }
        : null,
      departmentAssignedAt: updatedUser.departmentAssignedAt?.toISOString() ?? null,
    });
  } catch (error) {
    await writeUserActivityLog(
      req,
      'user.department.update',
      'failure',
      typeof req.params.userId === 'string' ? req.params.userId : null,
      error instanceof Error ? error.message : 'Failed to update user department',
    );
    return handleAdminError(error, res, '[updateAdminUserDepartment]');
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
    .select('_id name slug startingCredits')
    .lean<AdminPlanSummaryRecord | null>();

  if (!plan) {
    throw createStatusError(404, 'Plan not found');
  }

  return { planId, plan };
}

async function getExistingDepartmentOrThrow(
  departmentIdParam: string,
): Promise<{ departmentId: mongoose.Types.ObjectId; department: AdminDepartmentSummaryRecord }> {
  const departmentId = parseObjectId(departmentIdParam, 'departmentId');
  const department = await Department.findById(departmentId)
    .select('_id code name enabled')
    .lean<AdminDepartmentSummaryRecord | null>();

  if (!department) {
    throw createStatusError(404, 'Department not found');
  }

  if (department.enabled === false) {
    throw createStatusError(409, 'Cannot assign a disabled department');
  }

  return { departmentId, department };
}

function getQuotaAccountLimitCredits(account: QuotaAccountRecord): number {
  return (account.baseAllocatedCredits ?? 0) + (account.extraGrantedCredits ?? 0);
}

function getQuotaAccountAllocatableCredits(account: QuotaAccountRecord): number {
  return getQuotaAccountLimitCredits(account) - (account.reservedCredits ?? 0);
}

function getRequestUserId(req: Request): mongoose.Types.ObjectId | null {
  const user = (req as Request & { user?: { id?: string; _id?: string | mongoose.Types.ObjectId } })
    .user;
  const id = typeof user?.id === 'string' && user.id.length > 0 ? user.id : user?._id?.toString();

  return id ? parseObjectId(id, 'actorUserId') : null;
}

async function getQuotaPeriodForTransfer(
  quotaPeriodId: string | null,
): Promise<QuotaPeriodRecord | null> {
  if (quotaPeriodId) {
    const periodId = parseObjectId(quotaPeriodId, 'quotaPeriodId');
    return QuotaPeriod.findById(periodId).lean<QuotaPeriodRecord | null>();
  }

  const now = new Date();
  return QuotaPeriod.findOne({
    status: 'active',
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean<QuotaPeriodRecord | null>();
}

async function getCompanyRootDepartmentId(): Promise<string | null> {
  const department = await Department.findOne({ code: COMPANY_DEPARTMENT_CODE })
    .select('_id')
    .lean<CompanyRootDepartmentRecord | null>();

  return department?._id.toString() ?? null;
}

async function transferActiveUserQuotaParent(input: {
  req: Request;
  userId: mongoose.Types.ObjectId;
  targetDepartmentId: mongoose.Types.ObjectId | null;
  quotaPeriodId: string | null;
}) {
  const period = await getQuotaPeriodForTransfer(input.quotaPeriodId);
  if (!period) {
    return;
  }

  const userAccount = await QuotaAccount.findOne({
    periodId: period._id,
    scopeType: 'user',
    scopeId: input.userId.toString(),
  }).lean<QuotaAccountRecord | null>();

  if (!userAccount) {
    return;
  }

  if (!input.targetDepartmentId) {
    throw createStatusError(409, 'Cannot move a quota-assigned user to no department');
  }

  const targetDepartmentId = input.targetDepartmentId.toString();
  const companyRootDepartmentId = await getCompanyRootDepartmentId();
  const targetAccountQuery =
    companyRootDepartmentId != null && targetDepartmentId === companyRootDepartmentId
      ? {
          periodId: period._id,
          scopeType: 'company',
          scopeId: 'company',
        }
      : {
          periodId: period._id,
          scopeType: 'department',
          scopeId: targetDepartmentId,
        };

  const targetAccount = await QuotaAccount.findOne(
    targetAccountQuery,
  ).lean<QuotaAccountRecord | null>();

  if (!targetAccount) {
    throw createStatusError(409, 'Target quota account does not exist');
  }

  const currentParentAccountId = userAccount.parentAccountId?.toString() ?? null;
  if (currentParentAccountId === targetAccount._id.toString()) {
    return;
  }

  const transferCredits = userAccount.baseAllocatedCredits ?? 0;
  if (getQuotaAccountAllocatableCredits(targetAccount) < transferCredits) {
    throw createStatusError(409, 'Target department has insufficient quota credits');
  }

  const currentParentAccount = currentParentAccountId
    ? await QuotaAccount.findById(currentParentAccountId).lean<QuotaAccountRecord | null>()
    : null;
  const updates: Promise<unknown>[] = [
    QuotaAccount.updateOne(
      { _id: userAccount._id },
      { $set: { parentAccountId: targetAccount._id } },
    ),
    QuotaAccount.updateOne(
      { _id: targetAccount._id },
      { $set: { reservedCredits: (targetAccount.reservedCredits ?? 0) + transferCredits } },
    ),
  ];

  if (currentParentAccount) {
    updates.push(
      QuotaAccount.updateOne(
        { _id: currentParentAccount._id },
        {
          $set: {
            reservedCredits: Math.max(
              0,
              (currentParentAccount.reservedCredits ?? 0) - transferCredits,
            ),
          },
        },
      ),
    );
  }

  await Promise.all(updates);

  await QuotaLedgerEntry.create({
    periodId: period._id,
    accountId: userAccount._id,
    counterpartyAccountId: targetAccount._id,
    entryType: 'adjustment',
    amount: 0,
    balanceAfter:
      getQuotaAccountLimitCredits(userAccount) +
      (userAccount.bufferCredits ?? 0) -
      (userAccount.usedCredits ?? 0),
    sourceType: 'admin_action',
    sourceId: input.userId.toString(),
    reason: 'User department quota parent transferred',
    actorUserId: getRequestUserId(input.req),
  });
}

async function getExistingRoleOrThrow(roleNameParam: string): Promise<{ roleName: string }> {
  const roleName = normalizeRoleName(roleNameParam);
  const role = await Role.findOne({ name: roleName })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId } | null>();

  if (!role && Object.values(SystemRoles).includes(roleName as SystemRoles)) {
    return { roleName };
  }

  if (!role) {
    throw createStatusError(404, 'Role not found');
  }

  return { roleName };
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
    const currentBalance = await Balance.findOne({
      user: userId,
    }).lean<AdminBalanceRecord | null>();
    const nextBalance = await Balance.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          tokenCredits: getBalanceNumber(currentBalance?.tokenCredits) + amount,
          tokenCreditsLimit: getBalanceNumber(currentBalance?.tokenCreditsLimit) + amount,
          planTokenCredits: getBalanceNumber(currentBalance?.planTokenCredits),
          planTokenCreditsLimit: getBalanceNumber(currentBalance?.planTokenCreditsLimit),
        },
      },
      { new: true, upsert: true },
    ).lean<AdminBalanceRecord | null>();

    await createAdminBalanceTransaction(userId, amount, 'admin_add');

    return res.status(200).json({
      userId: userId.toString(),
      tokenCredits: extractTokenCredits(nextBalance),
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
    const currentLimit = getBalanceNumber(currentBalance?.tokenCreditsLimit);
    const nextLimit = Math.max(currentLimit, amount);

    const updatedBalance = await Balance.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          tokenCredits: amount,
          tokenCreditsLimit: nextLimit,
          planTokenCredits: Math.min(getBalanceNumber(currentBalance?.planTokenCredits), amount),
        },
      },
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
    const [existingUser, currentBalance] = await Promise.all([
      User.findById(userId).select('_id adminPlanId').lean<{
        _id: mongoose.Types.ObjectId;
        adminPlanId?: mongoose.Types.ObjectId | null;
      } | null>(),
      Balance.findOne({ user: userId }).lean<AdminBalanceRecord | null>(),
    ]);

    if (!existingUser) {
      throw createStatusError(404, 'User not found');
    }

    const existingPlanId = existingUser.adminPlanId?.toString() ?? null;
    const nextPlanCredits =
      typeof plan.startingCredits === 'number' ? Math.max(plan.startingCredits, 0) : 0;
    const shouldReplacePlanBalance = existingPlanId == null || existingPlanId !== planId.toString();

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

    if (shouldReplacePlanBalance) {
      const nextBalanceState = buildPlanBalanceUpdate({
        balance: currentBalance,
        nextPlanCredits,
      });

      await Balance.findOneAndUpdate(
        { user: userId },
        {
          $set: nextBalanceState,
        },
        { upsert: true, new: true },
      ).lean<AdminBalanceRecord | null>();
    }

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
    const currentBalance = await Balance.findOne({
      user: userId,
    }).lean<AdminBalanceRecord | null>();
    const nextBalanceState = buildPlanBalanceUpdate({
      balance: currentBalance,
      nextPlanCredits: 0,
    });

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

    await Balance.findOneAndUpdate(
      { user: userId },
      {
        $set: nextBalanceState,
      },
      { upsert: true, new: true },
    ).lean<AdminBalanceRecord | null>();

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

    await writeUserActivityLog(req, 'user.role.update', 'success', userId.toString());

    return res.status(200).json({
      userId: userId.toString(),
      role: updatedUser.role,
    });
  } catch (error) {
    await writeUserActivityLog(
      req,
      'user.role.update',
      'failure',
      typeof req.params.userId === 'string' ? req.params.userId : null,
      error instanceof Error ? error.message : 'Failed to update user role',
    );
    return handleAdminError(error, res, '[updateAdminUserRole]');
  }
}
