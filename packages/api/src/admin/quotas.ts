import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parseOptionalDate,
  parsePageSize,
  trimSearch,
} from './utils';
import { writeRequestActivityLog } from './activityLogs';
import {
  resolveAdminDataScope,
  resolveScopedDepartmentIds,
  resolveScopedUserIds,
} from './scope';

const {
  Department,
  QuotaAccount,
  QuotaAllocation,
  QuotaGrant,
  QuotaLedgerEntry,
  QuotaPeriod,
  QuotaRequest,
  User,
} = createModels(mongoose);

const COMPANY_DEPARTMENT_CODE = 'COMPANY';

const createQuotaPeriodSchema = z
  .object({
    year: z
      .number({
        required_error: 'year is required',
        invalid_type_error: 'year must be a number',
      })
      .int('year must be an integer')
      .min(1970, 'year must be 1970 or later')
      .max(9999, 'year is too large'),
    month: z.number().int().min(1).max(12).optional(),
    createFullYear: z.boolean().optional().default(false),
    timezone: z.string().trim().min(1, 'timezone is required').optional(),
    companyCredits: z
      .number({
        required_error: 'companyCredits is required',
        invalid_type_error: 'companyCredits must be a number',
      })
      .min(0, 'companyCredits must be greater than or equal to 0'),
    templatePeriodId: z
      .union([z.string().trim().min(1), z.literal(''), z.null()])
      .optional()
      .default(null)
      .transform((value) => (value === '' ? null : value)),
  })
  .refine((value) => value.createFullYear || value.month != null, {
    message: 'month is required unless createFullYear is true',
  });

const quotaAllocationSchema = z.object({
  periodId: z.string().trim().min(1, 'periodId is required'),
  fromAccountId: z.string().trim().min(1, 'fromAccountId is required'),
  scopeType: z.enum(['department', 'user']),
  scopeId: z.string().trim().min(1, 'scopeId is required'),
  amount: z.number().positive('amount must be greater than 0'),
  reason: z.string().trim().max(1000, 'reason is too long').optional().default(''),
});

const quotaGrantSchema = z.object({
  periodId: z.string().trim().min(1, 'periodId is required'),
  targetAccountId: z.string().trim().min(1, 'targetAccountId is required'),
  amount: z.number().positive('amount must be greater than 0'),
  reason: z.string().trim().min(1, 'reason is required').max(1000, 'reason is too long'),
  expiresAt: z.string().trim().min(1, 'expiresAt is required').optional(),
});

const quotaGrantDecisionSchema = z.object({
  reason: z.string().trim().max(1000, 'reason is too long').optional().default(''),
});

const quotaRequestSchema = z.object({
  periodId: z.string().trim().min(1, 'periodId is required'),
  targetAccountId: z.string().trim().min(1, 'targetAccountId is required'),
  sourceAccountId: z.string().trim().min(1, 'sourceAccountId is required').optional(),
  amount: z.number().positive('amount must be greater than 0'),
  reason: z.string().trim().min(1, 'reason is required').max(1000, 'reason is too long'),
});

const quotaRequestDecisionSchema = z.object({
  reason: z.string().trim().max(1000, 'reason is too long').optional().default(''),
});

type QuotaPeriodRecord = {
  _id: mongoose.Types.ObjectId;
  periodKey: string;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  status: 'draft' | 'active' | 'closed';
  closePolicy?: {
    billingDay?: number | null;
  };
  createdAt?: Date;
  updatedAt?: Date;
};

type QuotaAccountRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  scopeType: 'company' | 'department' | 'user';
  scopeId?: string | null;
  parentAccountId?: mongoose.Types.ObjectId | string | null;
  baseAllocatedCredits: number;
  extraGrantedCredits: number;
  usedCredits: number;
  reservedCredits: number;
  remainingCredits: number;
  warningThresholds: number[];
  hardLimitEnabled: boolean;
  bufferCredits: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type QuotaScopeUserRecord = {
  _id: mongoose.Types.ObjectId;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

type QuotaScopeDepartmentRecord = {
  _id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  enabled?: boolean;
};

type CompanyRootDepartmentRecord = {
  _id: mongoose.Types.ObjectId;
};

type QuotaAccountScopeMetadata = {
  scopeLabel?: string | null;
  scopeSecondaryLabel?: string | null;
  department?: {
    id: string;
    code: string;
    name: string;
    enabled: boolean;
  } | null;
};

type QuotaLedgerPair = {
  fromAccountId: string;
  toAccountId: string;
};

type QuotaLedgerEntryRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  accountId: mongoose.Types.ObjectId | string;
  counterpartyAccountId?: mongoose.Types.ObjectId | string | null;
  entryType: string;
  amount: number;
  balanceAfter: number;
  sourceType: string;
  sourceId?: string | null;
  reason?: string;
  actorUserId?: mongoose.Types.ObjectId | string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type QuotaAllocationRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  fromAccountId: mongoose.Types.ObjectId | string;
  toAccountId: mongoose.Types.ObjectId | string;
  amount: number;
  status: string;
  reason?: string;
  actorUserId?: mongoose.Types.ObjectId | string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type QuotaGrantRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  targetAccountId: mongoose.Types.ObjectId | string;
  requestedByUserId?: mongoose.Types.ObjectId | string | null;
  approvedByUserId?: mongoose.Types.ObjectId | string | null;
  amount: number;
  reason: string;
  status: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

type QuotaRequestRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  sourceAccountId: mongoose.Types.ObjectId | string;
  targetAccountId: mongoose.Types.ObjectId | string;
  requestedByUserId?: mongoose.Types.ObjectId | string | null;
  reviewedByUserId?: mongoose.Types.ObjectId | string | null;
  fulfilledAllocationId?: mongoose.Types.ObjectId | string | null;
  amount: number;
  reason: string;
  reviewReason?: string;
  status: string;
  requestedAt: Date;
  reviewedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type AppliedQuotaGrant = {
  grant: QuotaGrantRecord;
  account: QuotaAccountRecord;
};

type AppliedQuotaAllocation = {
  allocation: QuotaAllocationRecord;
  fromAccount: QuotaAccountRecord;
  toAccount: QuotaAccountRecord;
};

type QuotaAccountScopeIds = {
  visibleAccountIds: Set<string>;
  managedAccountIds: Set<string>;
};

type QuotaPeriodDefinition = {
  periodKey: string;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  billingDay: number;
};

function getAccountLimitCredits(account: QuotaAccountRecord): number {
  return (account.baseAllocatedCredits ?? 0) + (account.extraGrantedCredits ?? 0);
}

function getAccountUsableRemainingCredits(account: QuotaAccountRecord): number {
  return (
    getAccountLimitCredits(account) + (account.bufferCredits ?? 0) - (account.usedCredits ?? 0)
  );
}

function getAccountAllocatableLimitCredits(account: QuotaAccountRecord): number {
  return getAccountLimitCredits(account) - (account.reservedCredits ?? 0);
}

async function applyQuotaPeriodTemplate(input: {
  templatePeriodId: mongoose.Types.ObjectId;
  targetPeriodId: mongoose.Types.ObjectId;
  targetCompanyAccount: { _id: mongoose.Types.ObjectId };
  companyCredits: number;
}) {
  const templateAccounts = await QuotaAccount.find({ periodId: input.templatePeriodId })
    .sort({ scopeType: 1, scopeId: 1, _id: 1 })
    .lean<QuotaAccountRecord[]>();
  const templateCompanyAccount = templateAccounts.find(
    (account) => account.scopeType === 'company',
  );

  if (!templateCompanyAccount) {
    throw createStatusError(409, 'Template period does not have a company account');
  }

  if ((templateCompanyAccount.reservedCredits ?? 0) > input.companyCredits) {
    throw createStatusError(409, 'Company credits are insufficient for the selected template');
  }

  const createdAccountIdsByTemplateId = new Map<string, mongoose.Types.ObjectId>([
    [templateCompanyAccount._id.toString(), input.targetCompanyAccount._id],
  ]);
  const pendingTemplateAccounts = templateAccounts.filter(
    (account) => account.scopeType !== 'company',
  );

  while (pendingTemplateAccounts.length > 0) {
    let createdInPass = 0;

    for (let index = pendingTemplateAccounts.length - 1; index >= 0; index -= 1) {
      const templateAccount = pendingTemplateAccounts[index];
      const parentTemplateId = templateAccount.parentAccountId?.toString();
      const parentAccountId =
        parentTemplateId != null ? createdAccountIdsByTemplateId.get(parentTemplateId) : null;

      if (!parentAccountId) {
        continue;
      }

      const baseAllocatedCredits = templateAccount.baseAllocatedCredits ?? 0;
      const createdAccount = await QuotaAccount.create({
        periodId: input.targetPeriodId,
        scopeType: templateAccount.scopeType,
        scopeId: templateAccount.scopeId ?? null,
        parentAccountId,
        baseAllocatedCredits,
        reservedCredits: templateAccount.reservedCredits ?? 0,
        remainingCredits: baseAllocatedCredits,
        warningThresholds: templateAccount.warningThresholds,
        hardLimitEnabled: templateAccount.hardLimitEnabled,
        bufferCredits: templateAccount.bufferCredits ?? 0,
      });

      createdAccountIdsByTemplateId.set(templateAccount._id.toString(), createdAccount._id);
      pendingTemplateAccounts.splice(index, 1);
      createdInPass += 1;
    }

    if (createdInPass === 0) {
      throw createStatusError(409, 'Template period has invalid quota account hierarchy');
    }
  }

  await QuotaAccount.updateOne(
    { _id: input.targetCompanyAccount._id },
    { $set: { reservedCredits: templateCompanyAccount.reservedCredits ?? 0 } },
  );
}

function handleQuotaError(error: unknown, res: Response, context: string) {
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
    error instanceof Error ? error.message : 'An unexpected quota request error occurred';
  return res.status(statusCode).json({ message });
}

function toOptionalId(value: mongoose.Types.ObjectId | string | null | undefined): string | null {
  return value == null ? null : value.toString();
}

function sanitizePeriod(period: QuotaPeriodRecord) {
  return {
    id: period._id.toString(),
    periodKey: period.periodKey,
    timezone: period.timezone,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    status: period.status,
    billingDay: period.closePolicy?.billingDay ?? null,
    createdAt: period.createdAt?.toISOString() ?? null,
    updatedAt: period.updatedAt?.toISOString() ?? null,
  };
}

function getQuotaMonthStartDay(): number {
  const rawValue = process.env.QUOTA_MONTH_START_DAY ?? '1';
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
    throw createStatusError(500, 'QUOTA_MONTH_START_DAY must be an integer between 1 and 28');
  }

  return parsed;
}

function getSystemTimezone(): string {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatQuotaPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildQuotaPeriodDefinition(input: {
  year: number;
  month: number;
  timezone?: string;
}): QuotaPeriodDefinition {
  const billingDay = getQuotaMonthStartDay();
  const periodStart = new Date(input.year, input.month - 1, billingDay, 0, 0, 0, 0);
  const nextPeriodStart = new Date(input.year, input.month, billingDay, 0, 0, 0, 0);

  return {
    periodKey: formatQuotaPeriodKey(input.year, input.month),
    timezone: input.timezone ?? getSystemTimezone(),
    periodStart,
    periodEnd: new Date(nextPeriodStart.getTime() - 1),
    billingDay,
  };
}

function buildQuotaPeriodDefinitions(input: {
  year: number;
  month?: number;
  createFullYear: boolean;
  timezone?: string;
}): QuotaPeriodDefinition[] {
  const months = input.createFullYear
    ? Array.from({ length: 12 }, (_value, index) => index + 1)
    : [input.month as number];

  return months.map((month) =>
    buildQuotaPeriodDefinition({
      year: input.year,
      month,
      timezone: input.timezone,
    }),
  );
}

function toObjectIds(ids: string[]) {
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function sanitizeDepartmentSummary(department: QuotaScopeDepartmentRecord) {
  return {
    id: department._id.toString(),
    code: department.code,
    name: department.name,
    enabled: department.enabled ?? true,
  };
}

function getUserScopeLabel(user: QuotaScopeUserRecord) {
  return user.email ?? user.username ?? user.name ?? user._id.toString();
}

function getUserScopeSecondaryLabel(user: QuotaScopeUserRecord) {
  const parts = [user.username, user.name].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  return parts.length > 0 ? parts.join(' / ') : user._id.toString();
}

function getLegacyLedgerPairKey(entry: QuotaLedgerEntryRecord) {
  return [
    entry.periodId.toString(),
    Math.abs(entry.amount),
    entry.reason ?? '',
    entry.actorUserId?.toString() ?? '',
  ].join(':');
}

function buildLegacyLedgerPairs(entries: QuotaLedgerEntryRecord[]) {
  const positives = new Map<string, QuotaLedgerEntryRecord[]>();
  const pairs = new Map<string, QuotaLedgerPair>();

  for (const entry of entries) {
    if (entry.entryType !== 'allocation' || entry.sourceId || entry.amount <= 0) {
      continue;
    }

    const key = getLegacyLedgerPairKey(entry);
    positives.set(key, [...(positives.get(key) ?? []), entry]);
  }

  for (const entry of entries) {
    if (entry.entryType !== 'allocation' || entry.sourceId || entry.amount >= 0) {
      continue;
    }

    const key = getLegacyLedgerPairKey(entry);
    const targets = positives.get(key) ?? [];
    const sourceCreatedAt = entry.createdAt?.getTime() ?? 0;
    const targetIndex = targets.reduce((bestIndex, target, index) => {
      if (bestIndex < 0) {
        return index;
      }

      const currentDistance = Math.abs((target.createdAt?.getTime() ?? 0) - sourceCreatedAt);
      const bestDistance = Math.abs(
        (targets[bestIndex]?.createdAt?.getTime() ?? 0) - sourceCreatedAt,
      );

      return currentDistance < bestDistance ? index : bestIndex;
    }, -1);
    const target = targetIndex >= 0 ? targets.splice(targetIndex, 1)[0] : null;
    if (!target) {
      continue;
    }

    const pair = {
      fromAccountId: entry.accountId.toString(),
      toAccountId: target.accountId.toString(),
    };
    pairs.set(entry._id.toString(), pair);
    pairs.set(target._id.toString(), pair);
  }

  return pairs;
}

async function buildAccountScopeMetadata(accounts: QuotaAccountRecord[]) {
  const directDepartmentIds = accounts
    .filter((account) => account.scopeType === 'department' && account.scopeId)
    .map((account) => account.scopeId as string);
  const userIds = accounts
    .filter((account) => account.scopeType === 'user' && account.scopeId)
    .map((account) => account.scopeId as string);
  const users =
    userIds.length > 0
      ? await User.find({ _id: { $in: toObjectIds(userIds) } })
          .select('_id name username email departmentId')
          .lean<QuotaScopeUserRecord[]>()
      : [];
  const userDepartmentIds = users
    .map((user) => user.departmentId?.toString())
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const departmentIds = Array.from(new Set([...directDepartmentIds, ...userDepartmentIds]));
  const departments =
    departmentIds.length > 0
      ? await Department.find({ _id: { $in: toObjectIds(departmentIds) } })
          .select('_id code name enabled')
          .lean<QuotaScopeDepartmentRecord[]>()
      : [];
  const departmentsById = new Map(
    departments.map((department) => [department._id.toString(), department]),
  );
  const metadata = new Map<string, QuotaAccountScopeMetadata>();

  for (const department of departments) {
    metadata.set(`department:${department._id.toString()}`, {
      scopeLabel: `${department.name} (${department.code})`,
      department: sanitizeDepartmentSummary(department),
    });
  }

  for (const user of users) {
    const department =
      user.departmentId != null ? departmentsById.get(user.departmentId.toString()) : null;
    metadata.set(`user:${user._id.toString()}`, {
      scopeLabel: getUserScopeLabel(user),
      scopeSecondaryLabel: getUserScopeSecondaryLabel(user),
      department: department ? sanitizeDepartmentSummary(department) : null,
    });
  }

  return metadata;
}

function sanitizeAccount(account: QuotaAccountRecord, metadata?: QuotaAccountScopeMetadata) {
  const limitCredits = getAccountLimitCredits(account);
  const allocatableLimitCredits = getAccountAllocatableLimitCredits(account);
  const usableRemainingCredits = getAccountUsableRemainingCredits(account);

  return {
    id: account._id.toString(),
    periodId: account.periodId.toString(),
    scopeType: account.scopeType,
    scopeId: account.scopeId ?? null,
    scopeLabel: metadata?.scopeLabel ?? null,
    scopeSecondaryLabel: metadata?.scopeSecondaryLabel ?? null,
    department: metadata?.department ?? null,
    parentAccountId: toOptionalId(account.parentAccountId),
    baseAllocatedCredits: account.baseAllocatedCredits,
    extraGrantedCredits: account.extraGrantedCredits,
    usedCredits: account.usedCredits,
    reservedCredits: account.reservedCredits,
    remainingCredits: usableRemainingCredits,
    limitCredits,
    allocatedLimitCredits: account.reservedCredits,
    allocatableLimitCredits,
    usableRemainingCredits,
    warningThresholds: account.warningThresholds,
    hardLimitEnabled: account.hardLimitEnabled,
    bufferCredits: account.bufferCredits,
    createdAt: account.createdAt?.toISOString() ?? null,
    updatedAt: account.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeLedgerEntry(
  entry: QuotaLedgerEntryRecord,
  input?: {
    account?: QuotaAccountRecord | null;
    counterpartyAccount?: QuotaAccountRecord | null;
    allocation?: {
      fromAccount?: QuotaAccountRecord | null;
      toAccount?: QuotaAccountRecord | null;
    } | null;
    accountMetadata?: QuotaAccountScopeMetadata;
    counterpartyAccountMetadata?: QuotaAccountScopeMetadata;
    fromAccountMetadata?: QuotaAccountScopeMetadata;
    toAccountMetadata?: QuotaAccountScopeMetadata;
  },
) {
  const counterpartyAccountId =
    input?.counterpartyAccount?._id.toString() ?? toOptionalId(entry.counterpartyAccountId);

  return {
    id: entry._id.toString(),
    periodId: entry.periodId.toString(),
    accountId: entry.accountId.toString(),
    account: input?.account ? sanitizeAccount(input.account, input.accountMetadata) : null,
    counterpartyAccountId,
    counterpartyAccount: input?.counterpartyAccount
      ? sanitizeAccount(input.counterpartyAccount, input.counterpartyAccountMetadata)
      : null,
    entryType: entry.entryType,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId ?? null,
    allocation: input?.allocation
      ? {
          fromAccount: input.allocation.fromAccount
            ? sanitizeAccount(input.allocation.fromAccount, input.fromAccountMetadata)
            : null,
          toAccount: input.allocation.toAccount
            ? sanitizeAccount(input.allocation.toAccount, input.toAccountMetadata)
            : null,
        }
      : null,
    reason: entry.reason ?? '',
    actorUserId: toOptionalId(entry.actorUserId),
    createdAt: entry.createdAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeAllocation(allocation: QuotaAllocationRecord) {
  return {
    id: allocation._id.toString(),
    periodId: allocation.periodId.toString(),
    fromAccountId: allocation.fromAccountId.toString(),
    toAccountId: allocation.toAccountId.toString(),
    amount: allocation.amount,
    status: allocation.status,
    reason: allocation.reason ?? '',
    actorUserId: toOptionalId(allocation.actorUserId),
    createdAt: allocation.createdAt?.toISOString() ?? null,
    updatedAt: allocation.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeGrant(grant: QuotaGrantRecord) {
  return {
    id: grant._id.toString(),
    periodId: grant.periodId.toString(),
    targetAccountId: grant.targetAccountId.toString(),
    requestedByUserId: toOptionalId(grant.requestedByUserId),
    approvedByUserId: toOptionalId(grant.approvedByUserId),
    amount: grant.amount,
    reason: grant.reason,
    status: grant.status,
    expiresAt: grant.expiresAt.toISOString(),
    createdAt: grant.createdAt?.toISOString() ?? null,
    updatedAt: grant.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeQuotaRequest(
  request: QuotaRequestRecord,
  input?: {
    sourceAccount?: QuotaAccountRecord | null;
    targetAccount?: QuotaAccountRecord | null;
    sourceAccountMetadata?: QuotaAccountScopeMetadata;
    targetAccountMetadata?: QuotaAccountScopeMetadata;
  },
) {
  return {
    id: request._id.toString(),
    periodId: request.periodId.toString(),
    sourceAccountId: request.sourceAccountId.toString(),
    sourceAccount: input?.sourceAccount
      ? sanitizeAccount(input.sourceAccount, input.sourceAccountMetadata)
      : null,
    targetAccountId: request.targetAccountId.toString(),
    targetAccount: input?.targetAccount
      ? sanitizeAccount(input.targetAccount, input.targetAccountMetadata)
      : null,
    requestedByUserId: toOptionalId(request.requestedByUserId),
    reviewedByUserId: toOptionalId(request.reviewedByUserId),
    fulfilledAllocationId: toOptionalId(request.fulfilledAllocationId),
    amount: request.amount,
    reason: request.reason,
    reviewReason: request.reviewReason ?? '',
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdAt: request.createdAt?.toISOString() ?? null,
    updatedAt: request.updatedAt?.toISOString() ?? null,
  };
}

function getRequestUserId(req: Request): mongoose.Types.ObjectId | null {
  const user = (req as Request & { user?: { id?: string; _id?: string | mongoose.Types.ObjectId } })
    .user;
  const id = typeof user?.id === 'string' && user.id.length > 0 ? user.id : user?._id?.toString();

  return id ? parseObjectId(id, 'actorUserId') : null;
}

async function getPeriodOrThrow(periodId: mongoose.Types.ObjectId) {
  const period = await QuotaPeriod.findById(periodId).lean<QuotaPeriodRecord | null>();
  if (!period) {
    throw createStatusError(404, 'Quota period not found');
  }
  return period;
}

async function getAccountOrThrow(accountId: mongoose.Types.ObjectId) {
  const account = await QuotaAccount.findById(accountId).lean<QuotaAccountRecord | null>();
  if (!account) {
    throw createStatusError(404, 'Quota account not found');
  }
  return account;
}

function assertCompanyGrantTarget(account: QuotaAccountRecord) {
  if (account.scopeType !== 'company') {
    throw createStatusError(400, 'Quota grant requests can only target the company account');
  }
}

async function findOrCreateAccount(input: {
  periodId: mongoose.Types.ObjectId;
  scopeType: 'department' | 'user';
  scopeId: string;
  parentAccountId: mongoose.Types.ObjectId;
}) {
  const existing = await QuotaAccount.findOne({
    periodId: input.periodId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  }).lean<QuotaAccountRecord | null>();

  if (existing) {
    return existing;
  }

  const created = await QuotaAccount.create({
    periodId: input.periodId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    parentAccountId: input.parentAccountId,
  });

  return QuotaAccount.findById(created._id).lean<QuotaAccountRecord>().orFail();
}

async function resolveQuotaAccountScopeIds(req: Request, periodId?: mongoose.Types.ObjectId) {
  const scope = await resolveAdminDataScope(req);
  if (scope.type === 'all') {
    return null;
  }

  const [departmentIds, userIds] = await Promise.all([
    resolveScopedDepartmentIds(scope),
    resolveScopedUserIds(scope),
  ]);
  const managedFilters: mongoose.FilterQuery<QuotaAccountRecord>[] = [
    { scopeType: 'department', scopeId: { $in: (departmentIds ?? []).map((id) => id.toString()) } },
    { scopeType: 'user', scopeId: { $in: (userIds ?? []).map((id) => id.toString()) } },
  ];
  const managedAccounts = await QuotaAccount.find({
    ...(periodId ? { periodId } : {}),
    $or: managedFilters,
  })
    .select('_id parentAccountId')
    .lean<QuotaAccountRecord[]>();
  const managedAccountIds = new Set(managedAccounts.map((account) => account._id.toString()));
  const visibleAccountIds = new Set(managedAccountIds);
  const parentAccountIds = managedAccounts
    .map((account) => account.parentAccountId?.toString())
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  for (const parentAccountId of parentAccountIds) {
    visibleAccountIds.add(parentAccountId);
  }

  return { visibleAccountIds, managedAccountIds };
}

function assertQuotaAccountInScope(
  quotaAccountScopeIds: QuotaAccountScopeIds | null,
  accountId: mongoose.Types.ObjectId | string,
  message: string,
) {
  if (quotaAccountScopeIds == null) {
    return;
  }

  if (!quotaAccountScopeIds.visibleAccountIds.has(accountId.toString())) {
    throw createStatusError(403, message);
  }
}

function assertManagedQuotaAccountInScope(
  quotaAccountScopeIds: QuotaAccountScopeIds | null,
  accountId: mongoose.Types.ObjectId | string,
  message: string,
) {
  if (quotaAccountScopeIds == null) {
    return;
  }

  if (!quotaAccountScopeIds.managedAccountIds.has(accountId.toString())) {
    throw createStatusError(403, message);
  }
}

async function assertAllocationTargetAllowed(input: {
  fromAccount: QuotaAccountRecord;
  scopeType: 'department' | 'user';
  scopeId: string;
}) {
  if (
    (input.fromAccount.scopeType === 'company' || input.fromAccount.scopeType === 'department') &&
    input.scopeType === 'department'
  ) {
    const department = await Department.findById(input.scopeId)
      .select('_id parentDepartmentId')
      .lean<{ _id: mongoose.Types.ObjectId; parentDepartmentId?: mongoose.Types.ObjectId | null } | null>();

    if (!department) {
      throw createStatusError(404, 'Department not found');
    }

    if (input.fromAccount.scopeType === 'company') {
      const parentDepartmentId = department.parentDepartmentId?.toString() ?? null;
      if (parentDepartmentId == null) {
        return;
      }

      const companyRootDepartment = await Department.findOne({ code: COMPANY_DEPARTMENT_CODE })
        .select('_id')
        .lean<CompanyRootDepartmentRecord | null>();

      if (
        (!companyRootDepartment || parentDepartmentId !== companyRootDepartment._id.toString())
      ) {
        throw createStatusError(409, 'Cannot allocate company quota to a nested department');
      }

      return;
    }

    if (department.parentDepartmentId?.toString() !== input.fromAccount.scopeId) {
      throw createStatusError(
        409,
        'Cannot allocate department quota to a department outside its direct children',
      );
    }

    return;
  }

  if (
    (input.fromAccount.scopeType !== 'company' && input.fromAccount.scopeType !== 'department') ||
    input.scopeType !== 'user'
  ) {
    return;
  }

  const user = await User.findById(input.scopeId)
    .select('_id departmentId')
    .lean<QuotaScopeUserRecord | null>();

  if (!user) {
    throw createStatusError(404, 'User not found');
  }

  if (input.fromAccount.scopeType === 'company') {
    if (!user.departmentId) {
      throw createStatusError(
        409,
        'Cannot allocate company quota directly to a user without a department',
      );
    }

    const companyRootDepartment = await Department.findOne({ code: COMPANY_DEPARTMENT_CODE })
      .select('_id')
      .lean<CompanyRootDepartmentRecord | null>();

    if (
      !companyRootDepartment ||
      user.departmentId.toString() !== companyRootDepartment._id.toString()
    ) {
      throw createStatusError(409, 'Cannot allocate company quota directly to a non-company user');
    }

    return;
  }

  if (user.departmentId?.toString() !== input.fromAccount.scopeId) {
    throw createStatusError(
      409,
      'Cannot allocate department quota to a user outside the department',
    );
  }
}

async function applyQuotaAllocation(input: {
  req: Request;
  periodId: mongoose.Types.ObjectId;
  fromAccount: QuotaAccountRecord;
  toAccount: QuotaAccountRecord;
  amount: number;
  reason: string;
  sourceType: 'admin_action' | 'manager_action' | 'system';
  sourceId?: string | null;
}) {
  if (getAccountAllocatableLimitCredits(input.fromAccount) < input.amount) {
    throw createStatusError(409, 'Insufficient quota credits');
  }

  const actorUserId = getRequestUserId(input.req);
  const updatedFromReserved = (input.fromAccount.reservedCredits ?? 0) + input.amount;
  const updatedFromAllocatable = getAccountLimitCredits(input.fromAccount) - updatedFromReserved;
  const updatedToBase = (input.toAccount.baseAllocatedCredits ?? 0) + input.amount;
  const updatedToRemaining =
    updatedToBase +
    (input.toAccount.extraGrantedCredits ?? 0) +
    (input.toAccount.bufferCredits ?? 0) -
    (input.toAccount.usedCredits ?? 0);
  const allocation = await QuotaAllocation.create({
    periodId: input.periodId,
    fromAccountId: input.fromAccount._id,
    toAccountId: input.toAccount._id,
    amount: input.amount,
    reason: input.reason,
    actorUserId,
  });
  const sourceId = input.sourceId ?? allocation._id.toString();

  await Promise.all([
    QuotaAccount.updateOne(
      { _id: input.fromAccount._id },
      {
        $set: {
          reservedCredits: updatedFromReserved,
          remainingCredits: getAccountUsableRemainingCredits(input.fromAccount),
        },
      },
    ),
    QuotaAccount.updateOne(
      { _id: input.toAccount._id },
      {
        $set: {
          baseAllocatedCredits: updatedToBase,
          remainingCredits: updatedToRemaining,
        },
      },
    ),
    QuotaLedgerEntry.create({
      periodId: input.periodId,
      accountId: input.fromAccount._id,
      counterpartyAccountId: input.toAccount._id,
      entryType: 'allocation',
      amount: -input.amount,
      balanceAfter: updatedFromAllocatable,
      sourceType: input.sourceType,
      sourceId,
      reason: input.reason,
      actorUserId,
    }),
    QuotaLedgerEntry.create({
      periodId: input.periodId,
      accountId: input.toAccount._id,
      counterpartyAccountId: input.fromAccount._id,
      entryType: 'allocation',
      amount: input.amount,
      balanceAfter: updatedToRemaining,
      sourceType: input.sourceType,
      sourceId,
      reason: input.reason,
      actorUserId,
    }),
  ]);

  const [storedAllocation, storedFromAccount, storedToAccount] = await Promise.all([
    QuotaAllocation.findById(allocation._id).lean<QuotaAllocationRecord>().orFail(),
    QuotaAccount.findById(input.fromAccount._id).lean<QuotaAccountRecord>().orFail(),
    QuotaAccount.findById(input.toAccount._id).lean<QuotaAccountRecord>().orFail(),
  ]);

  return {
    allocation: storedAllocation,
    fromAccount: storedFromAccount,
    toAccount: storedToAccount,
  };
}

function assertQuotaRequestAccounts(input: {
  periodId: mongoose.Types.ObjectId;
  sourceAccount: QuotaAccountRecord;
  targetAccount: QuotaAccountRecord;
}) {
  if (input.sourceAccount.periodId.toString() !== input.periodId.toString()) {
    throw createStatusError(400, 'sourceAccountId is outside the quota period');
  }

  if (input.targetAccount.periodId.toString() !== input.periodId.toString()) {
    throw createStatusError(400, 'targetAccountId is outside the quota period');
  }

  if (input.targetAccount.scopeType === 'company') {
    throw createStatusError(400, 'Company quota must use admin grant instead of quota request');
  }

  if (input.sourceAccount._id.toString() === input.targetAccount._id.toString()) {
    throw createStatusError(400, 'Cannot request quota from the same account');
  }

  if (input.targetAccount.parentAccountId?.toString() !== input.sourceAccount._id.toString()) {
    throw createStatusError(409, 'Quota requests must target the parent account');
  }
}

async function writeQuotaActivityLog(
  req: Request,
  input: {
    action: string;
    resourceType: string;
    resourceId: string | null;
    message?: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  await writeRequestActivityLog(req, {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    result: 'success',
    message: input.message ?? '',
    metadata: input.metadata ?? {},
  });
}

async function applyApprovedQuotaGrant(input: {
  req: Request;
  periodId: mongoose.Types.ObjectId;
  targetAccount: QuotaAccountRecord;
  amount: number;
  reason: string;
  grantId: mongoose.Types.ObjectId;
}) {
  const actorUserId = getRequestUserId(input.req);
  const updatedExtra = input.targetAccount.extraGrantedCredits + input.amount;
  const updatedRemaining =
    (input.targetAccount.baseAllocatedCredits ?? 0) +
    updatedExtra +
    (input.targetAccount.bufferCredits ?? 0) -
    (input.targetAccount.usedCredits ?? 0);

  await Promise.all([
    QuotaAccount.updateOne(
      { _id: input.targetAccount._id },
      {
        $set: {
          extraGrantedCredits: updatedExtra,
          remainingCredits: updatedRemaining,
        },
      },
    ),
    QuotaLedgerEntry.create({
      periodId: input.periodId,
      accountId: input.targetAccount._id,
      entryType: 'grant',
      amount: input.amount,
      balanceAfter: updatedRemaining,
      sourceType: 'admin_action',
      sourceId: input.grantId.toString(),
      reason: input.reason,
      actorUserId,
    }),
  ]);

  const [grant, account] = await Promise.all([
    QuotaGrant.findById(input.grantId).lean<QuotaGrantRecord>().orFail(),
    QuotaAccount.findById(input.targetAccount._id).lean<QuotaAccountRecord>().orFail(),
  ]);

  return { grant, account };
}

export async function getAdminQuotaPeriods(req: Request, res: Response) {
  try {
    const status = trimSearch(req.query.status);
    const filters: mongoose.FilterQuery<QuotaPeriodRecord>[] = [];

    if (status && status !== 'all') {
      if (!['draft', 'active', 'closed'].includes(status)) {
        throw createStatusError(400, 'status must be one of draft, active, closed, or all');
      }
      filters.push({ status });
    }

    const periods = await QuotaPeriod.find(filters.length > 0 ? { $and: filters } : {})
      .sort({ periodStart: -1, _id: -1 })
      .lean<QuotaPeriodRecord[]>();

    return res.status(200).json({ periods: periods.map(sanitizePeriod) });
  } catch (error) {
    return handleQuotaError(error, res, '[getAdminQuotaPeriods]');
  }
}

export async function createAdminQuotaPeriod(req: Request, res: Response) {
  try {
    const input = createQuotaPeriodSchema.parse(req.body);
    const definitions = buildQuotaPeriodDefinitions(input);

    for (const definition of definitions) {
      const existing = await QuotaPeriod.findOne({ periodKey: definition.periodKey })
        .select('_id')
        .lean();
      if (existing) {
        throw createStatusError(409, 'Quota period already exists');
      }
    }

    const createdItems = [];

    for (const definition of definitions) {
      const period = await QuotaPeriod.create({
        periodKey: definition.periodKey,
        timezone: definition.timezone,
        periodStart: definition.periodStart,
        periodEnd: definition.periodEnd,
        closePolicy: {
          billingDay: definition.billingDay,
        },
      });
      const companyAccount = await QuotaAccount.create({
        periodId: period._id,
        scopeType: 'company',
        scopeId: 'company',
        baseAllocatedCredits: input.companyCredits,
        remainingCredits: input.companyCredits,
      });
      const templatePeriodId = input.templatePeriodId
        ? parseObjectId(input.templatePeriodId, 'templatePeriodId')
        : null;

      if (templatePeriodId) {
        await applyQuotaPeriodTemplate({
          templatePeriodId,
          targetPeriodId: period._id,
          targetCompanyAccount: companyAccount,
          companyCredits: input.companyCredits,
        });
      }

      await QuotaLedgerEntry.create({
        periodId: period._id,
        accountId: companyAccount._id,
        entryType: 'allocation',
        amount: input.companyCredits,
        balanceAfter: input.companyCredits,
        sourceType: 'admin_action',
        sourceId: period._id.toString(),
        reason: 'Initial company quota',
        actorUserId: getRequestUserId(req),
      });
      await writeQuotaActivityLog(req, {
        action: 'quota_period.create',
        resourceType: 'quota_period',
        resourceId: period._id.toString(),
        metadata: {
          periodId: period._id.toString(),
          companyAccountId: companyAccount._id.toString(),
          companyCredits: input.companyCredits,
        },
      });

      const storedPeriod = await QuotaPeriod.findById(period._id)
        .lean<QuotaPeriodRecord>()
        .orFail();
      const storedAccount = await QuotaAccount.findById(companyAccount._id)
        .lean<QuotaAccountRecord>()
        .orFail();

      createdItems.push({
        period: sanitizePeriod(storedPeriod),
        companyAccount: sanitizeAccount(storedAccount),
      });
    }

    const firstItem = createdItems[0];
    if (!firstItem) {
      throw createStatusError(400, 'No quota periods were created');
    }

    return res.status(201).json({
      period: firstItem.period,
      companyAccount: firstItem.companyAccount,
      periods: createdItems.map((item) => item.period),
      companyAccounts: createdItems.map((item) => item.companyAccount),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[createAdminQuotaPeriod]');
  }
}

export async function activateAdminQuotaPeriod(req: Request, res: Response) {
  try {
    const periodId = parseObjectId(req.params.periodId, 'periodId');
    const period = await QuotaPeriod.findByIdAndUpdate(
      periodId,
      { $set: { status: 'active' } },
      { new: true },
    ).lean<QuotaPeriodRecord | null>();

    if (!period) {
      throw createStatusError(404, 'Quota period not found');
    }

    await writeQuotaActivityLog(req, {
      action: 'quota_period.activate',
      resourceType: 'quota_period',
      resourceId: periodId.toString(),
      metadata: { periodId: periodId.toString() },
    });

    return res.status(200).json(sanitizePeriod(period));
  } catch (error) {
    return handleQuotaError(error, res, '[activateAdminQuotaPeriod]');
  }
}

export async function closeAdminQuotaPeriod(req: Request, res: Response) {
  try {
    const periodId = parseObjectId(req.params.periodId, 'periodId');
    const period = await QuotaPeriod.findByIdAndUpdate(
      periodId,
      { $set: { status: 'closed' } },
      { new: true },
    ).lean<QuotaPeriodRecord | null>();

    if (!period) {
      throw createStatusError(404, 'Quota period not found');
    }

    await writeQuotaActivityLog(req, {
      action: 'quota_period.close',
      resourceType: 'quota_period',
      resourceId: periodId.toString(),
      metadata: { periodId: periodId.toString() },
    });

    return res.status(200).json(sanitizePeriod(period));
  } catch (error) {
    return handleQuotaError(error, res, '[closeAdminQuotaPeriod]');
  }
}

export async function getAdminQuotaAccounts(req: Request, res: Response) {
  try {
    const periodId = trimSearch(req.query.periodId);
    const scopeType = trimSearch(req.query.scopeType);
    const filters: mongoose.FilterQuery<QuotaAccountRecord>[] = [];
    const parsedPeriodId = periodId ? parseObjectId(periodId, 'periodId') : undefined;
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, parsedPeriodId);

    if (parsedPeriodId) {
      filters.push({ periodId: parsedPeriodId });
    }

    if (quotaAccountScopeIds != null) {
      filters.push({
        _id: { $in: toObjectIds(Array.from(quotaAccountScopeIds.visibleAccountIds)) },
      });
    }

    if (scopeType && scopeType !== 'all') {
      if (!['company', 'department', 'user'].includes(scopeType)) {
        throw createStatusError(400, 'scopeType must be one of company, department, user, or all');
      }
      filters.push({ scopeType });
    }

    const accounts = await QuotaAccount.find(filters.length > 0 ? { $and: filters } : {})
      .sort({ scopeType: 1, scopeId: 1, _id: 1 })
      .lean<QuotaAccountRecord[]>();
    const metadata = await buildAccountScopeMetadata(accounts);

    return res.status(200).json({
      accounts: accounts.map((account) =>
        sanitizeAccount(account, metadata.get(`${account.scopeType}:${account.scopeId ?? ''}`)),
      ),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[getAdminQuotaAccounts]');
  }
}

export async function createAdminQuotaAllocation(req: Request, res: Response) {
  try {
    const input = quotaAllocationSchema.parse(req.body);
    const periodId = parseObjectId(input.periodId, 'periodId');
    const fromAccountId = parseObjectId(input.fromAccountId, 'fromAccountId');
    const [period, fromAccount] = await Promise.all([
      getPeriodOrThrow(periodId),
      getAccountOrThrow(fromAccountId),
    ]);

    if (fromAccount.periodId.toString() !== period._id.toString()) {
      throw createStatusError(400, 'fromAccountId is outside the quota period');
    }
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, periodId);
    assertManagedQuotaAccountInScope(
      quotaAccountScopeIds,
      fromAccount._id,
      'fromAccountId is outside the allowed scope',
    );

    if (
      fromAccount.scopeType === input.scopeType &&
      (fromAccount.scopeId ?? '') === input.scopeId
    ) {
      throw createStatusError(400, 'Cannot allocate quota to the source account');
    }

    await assertAllocationTargetAllowed({
      fromAccount,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });

    if (getAccountAllocatableLimitCredits(fromAccount) < input.amount) {
      throw createStatusError(409, 'Insufficient quota credits');
    }

    const toAccount = await findOrCreateAccount({
      periodId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      parentAccountId: fromAccount._id,
    });
    const appliedAllocation: AppliedQuotaAllocation = await applyQuotaAllocation({
      req,
      periodId,
      fromAccount,
      toAccount,
      amount: input.amount,
      reason: input.reason,
      sourceType: 'admin_action',
    });

    await writeQuotaActivityLog(req, {
      action: 'quota_allocation.create',
      resourceType: 'quota_allocation',
      resourceId: appliedAllocation.allocation._id.toString(),
      metadata: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        toAccountId: appliedAllocation.toAccount._id.toString(),
        amount: input.amount,
      },
    });

    return res.status(201).json({
      allocation: sanitizeAllocation(appliedAllocation.allocation),
      fromAccount: sanitizeAccount(appliedAllocation.fromAccount),
      toAccount: sanitizeAccount(appliedAllocation.toAccount),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[createAdminQuotaAllocation]');
  }
}

export async function createAdminQuotaGrant(req: Request, res: Response) {
  try {
    const input = quotaGrantSchema.parse(req.body);
    const periodId = parseObjectId(input.periodId, 'periodId');
    const targetAccountId = parseObjectId(input.targetAccountId, 'targetAccountId');
    const [period, targetAccount] = await Promise.all([
      getPeriodOrThrow(periodId),
      getAccountOrThrow(targetAccountId),
    ]);

    if (targetAccount.periodId.toString() !== period._id.toString()) {
      throw createStatusError(400, 'targetAccountId is outside the quota period');
    }
    assertCompanyGrantTarget(targetAccount);

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : period.periodEnd;
    if (Number.isNaN(expiresAt.getTime())) {
      throw createStatusError(400, 'expiresAt must be a valid ISO date string');
    }

    const actorUserId = getRequestUserId(req);
    const createdGrant = await QuotaGrant.create({
      periodId,
      targetAccountId,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      amount: input.amount,
      reason: input.reason,
      status: 'approved',
      expiresAt,
    });
    const appliedGrant: AppliedQuotaGrant = await applyApprovedQuotaGrant({
      req,
      periodId,
      targetAccount,
      amount: input.amount,
      reason: input.reason,
      grantId: createdGrant._id,
    });

    await writeQuotaActivityLog(req, {
      action: 'quota_grant.approve',
      resourceType: 'quota_grant',
      resourceId: createdGrant._id.toString(),
      metadata: {
        periodId: periodId.toString(),
        targetAccountId: targetAccountId.toString(),
        amount: input.amount,
      },
    });

    return res.status(201).json({
      grant: sanitizeGrant(appliedGrant.grant),
      account: sanitizeAccount(appliedGrant.account),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[createAdminQuotaGrant]');
  }
}

export async function getAdminQuotaGrants(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const periodId = trimSearch(req.query.periodId);
    const targetAccountId = trimSearch(req.query.targetAccountId);
    const status = trimSearch(req.query.status);
    const cursorFilter = buildCreatedAtCursorFilter<QuotaGrantRecord>(trimSearch(req.query.cursor));
    const filters: mongoose.FilterQuery<QuotaGrantRecord>[] = [];

    if (periodId) {
      filters.push({ periodId: parseObjectId(periodId, 'periodId') });
    }

    if (targetAccountId) {
      filters.push({ targetAccountId: parseObjectId(targetAccountId, 'targetAccountId') });
    }

    if (status && status !== 'all') {
      if (!['requested', 'approved', 'rejected', 'cancelled'].includes(status)) {
        throw createStatusError(
          400,
          'status must be one of requested, approved, rejected, cancelled, or all',
        );
      }
      filters.push({ status });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const results = await QuotaGrant.find(filters.length > 0 ? { $and: filters } : {})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<QuotaGrantRecord[]>();
    const page = buildPagedResult(results, limit);

    return res.status(200).json({
      grants: page.items.map(sanitizeGrant),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return handleQuotaError(error, res, '[getAdminQuotaGrants]');
  }
}

export async function createAdminQuotaGrantRequest(req: Request, res: Response) {
  try {
    const input = quotaGrantSchema.parse(req.body);
    const periodId = parseObjectId(input.periodId, 'periodId');
    const targetAccountId = parseObjectId(input.targetAccountId, 'targetAccountId');
    const [period, targetAccount] = await Promise.all([
      getPeriodOrThrow(periodId),
      getAccountOrThrow(targetAccountId),
    ]);

    if (targetAccount.periodId.toString() !== period._id.toString()) {
      throw createStatusError(400, 'targetAccountId is outside the quota period');
    }
    assertCompanyGrantTarget(targetAccount);

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : period.periodEnd;
    if (Number.isNaN(expiresAt.getTime())) {
      throw createStatusError(400, 'expiresAt must be a valid ISO date string');
    }

    const grant = await QuotaGrant.create({
      periodId,
      targetAccountId,
      requestedByUserId: getRequestUserId(req),
      approvedByUserId: null,
      amount: input.amount,
      reason: input.reason,
      status: 'requested',
      expiresAt,
    });

    await writeQuotaActivityLog(req, {
      action: 'quota_grant.request',
      resourceType: 'quota_grant',
      resourceId: grant._id.toString(),
      metadata: {
        periodId: periodId.toString(),
        targetAccountId: targetAccountId.toString(),
        amount: input.amount,
      },
    });

    const storedGrant = await QuotaGrant.findById(grant._id).lean<QuotaGrantRecord>().orFail();

    return res.status(201).json({
      grant: sanitizeGrant(storedGrant),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[createAdminQuotaGrantRequest]');
  }
}

export async function approveAdminQuotaGrantRequest(req: Request, res: Response) {
  try {
    const grantId = parseObjectId(req.params.grantId, 'grantId');
    const input = quotaGrantDecisionSchema.parse(req.body);
    const existingGrant = await QuotaGrant.findById(grantId).lean<QuotaGrantRecord | null>();

    if (!existingGrant) {
      throw createStatusError(404, 'Quota grant request not found');
    }

    if (existingGrant.status !== 'requested') {
      throw createStatusError(409, 'Quota grant request is not pending');
    }

    const periodId = parseObjectId(existingGrant.periodId.toString(), 'periodId');
    const targetAccountId = parseObjectId(
      existingGrant.targetAccountId.toString(),
      'targetAccountId',
    );
    const [period, targetAccount] = await Promise.all([
      getPeriodOrThrow(periodId),
      getAccountOrThrow(targetAccountId),
    ]);

    if (targetAccount.periodId.toString() !== period._id.toString()) {
      throw createStatusError(400, 'targetAccountId is outside the quota period');
    }
    assertCompanyGrantTarget(targetAccount);

    const approvedGrant = await QuotaGrant.findByIdAndUpdate(
      grantId,
      {
        $set: {
          approvedByUserId: getRequestUserId(req),
          status: 'approved',
          reason: input.reason ? `${existingGrant.reason}\n${input.reason}` : existingGrant.reason,
        },
      },
      { new: true },
    ).lean<QuotaGrantRecord | null>();

    if (!approvedGrant) {
      throw createStatusError(404, 'Quota grant request not found');
    }

    const appliedGrant = await applyApprovedQuotaGrant({
      req,
      periodId,
      targetAccount,
      amount: approvedGrant.amount,
      reason: approvedGrant.reason,
      grantId,
    });

    await writeQuotaActivityLog(req, {
      action: 'quota_grant.request.approve',
      resourceType: 'quota_grant',
      resourceId: grantId.toString(),
      metadata: {
        periodId: periodId.toString(),
        targetAccountId: targetAccountId.toString(),
        amount: approvedGrant.amount,
      },
    });

    return res.status(200).json({
      grant: sanitizeGrant(appliedGrant.grant),
      account: sanitizeAccount(appliedGrant.account),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[approveAdminQuotaGrantRequest]');
  }
}

export async function rejectAdminQuotaGrantRequest(req: Request, res: Response) {
  try {
    const grantId = parseObjectId(req.params.grantId, 'grantId');
    const input = quotaGrantDecisionSchema.parse(req.body);
    const existingGrant = await QuotaGrant.findById(grantId).lean<QuotaGrantRecord | null>();

    if (!existingGrant) {
      throw createStatusError(404, 'Quota grant request not found');
    }

    if (existingGrant.status !== 'requested') {
      throw createStatusError(409, 'Quota grant request is not pending');
    }

    const rejectedGrant = await QuotaGrant.findByIdAndUpdate(
      grantId,
      {
        $set: {
          approvedByUserId: getRequestUserId(req),
          status: 'rejected',
          reason: input.reason ? `${existingGrant.reason}\n${input.reason}` : existingGrant.reason,
        },
      },
      { new: true },
    ).lean<QuotaGrantRecord | null>();

    if (!rejectedGrant) {
      throw createStatusError(404, 'Quota grant request not found');
    }

    await writeQuotaActivityLog(req, {
      action: 'quota_grant.request.reject',
      resourceType: 'quota_grant',
      resourceId: grantId.toString(),
      metadata: {
        periodId: rejectedGrant.periodId.toString(),
        targetAccountId: rejectedGrant.targetAccountId.toString(),
        amount: rejectedGrant.amount,
      },
    });

    return res.status(200).json({ grant: sanitizeGrant(rejectedGrant) });
  } catch (error) {
    return handleQuotaError(error, res, '[rejectAdminQuotaGrantRequest]');
  }
}

export async function getAdminQuotaRequests(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const periodId = trimSearch(req.query.periodId);
    const sourceAccountId = trimSearch(req.query.sourceAccountId);
    const targetAccountId = trimSearch(req.query.targetAccountId);
    const status = trimSearch(req.query.status);
    const cursorFilter = buildCreatedAtCursorFilter<QuotaRequestRecord>(
      trimSearch(req.query.cursor),
    );
    const filters: mongoose.FilterQuery<QuotaRequestRecord>[] = [];
    const parsedPeriodId = periodId ? parseObjectId(periodId, 'periodId') : undefined;
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, parsedPeriodId);

    if (parsedPeriodId) {
      filters.push({ periodId: parsedPeriodId });
    }

    if (quotaAccountScopeIds != null) {
      const visibleAccountObjectIds = toObjectIds(
        Array.from(quotaAccountScopeIds.visibleAccountIds),
      );
      filters.push({
        $or: [
          { sourceAccountId: { $in: visibleAccountObjectIds } },
          { targetAccountId: { $in: visibleAccountObjectIds } },
        ],
      });
    }

    if (sourceAccountId) {
      filters.push({ sourceAccountId: parseObjectId(sourceAccountId, 'sourceAccountId') });
    }

    if (targetAccountId) {
      filters.push({ targetAccountId: parseObjectId(targetAccountId, 'targetAccountId') });
    }

    if (status && status !== 'all') {
      if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
        throw createStatusError(
          400,
          'status must be one of pending, approved, rejected, cancelled, or all',
        );
      }
      filters.push({ status });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const results = await QuotaRequest.find(filters.length > 0 ? { $and: filters } : {})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<QuotaRequestRecord[]>();
    const page = buildPagedResult<QuotaRequestRecord>(results, limit);
    const accountIds = new Set<string>();

    for (const request of page.items) {
      accountIds.add(request.sourceAccountId.toString());
      accountIds.add(request.targetAccountId.toString());
    }

    const accounts =
      accountIds.size > 0
        ? await QuotaAccount.find({ _id: { $in: toObjectIds(Array.from(accountIds)) } }).lean<
            QuotaAccountRecord[]
          >()
        : [];
    const accountsById = new Map(accounts.map((account) => [account._id.toString(), account]));
    const accountMetadata = await buildAccountScopeMetadata(accounts);

    return res.status(200).json({
      requests: page.items.map((request) => {
        const sourceAccount = accountsById.get(request.sourceAccountId.toString()) ?? null;
        const targetAccount = accountsById.get(request.targetAccountId.toString()) ?? null;

        return sanitizeQuotaRequest(request, {
          sourceAccount,
          targetAccount,
          sourceAccountMetadata: sourceAccount
            ? accountMetadata.get(`${sourceAccount.scopeType}:${sourceAccount.scopeId ?? ''}`)
            : undefined,
          targetAccountMetadata: targetAccount
            ? accountMetadata.get(`${targetAccount.scopeType}:${targetAccount.scopeId ?? ''}`)
            : undefined,
        });
      }),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return handleQuotaError(error, res, '[getAdminQuotaRequests]');
  }
}

export async function createAdminQuotaRequest(req: Request, res: Response) {
  try {
    const input = quotaRequestSchema.parse(req.body);
    const periodId = parseObjectId(input.periodId, 'periodId');
    const targetAccountId = parseObjectId(input.targetAccountId, 'targetAccountId');
    const period = await getPeriodOrThrow(periodId);
    const targetAccount = await getAccountOrThrow(targetAccountId);
    const parentAccountId = targetAccount.parentAccountId?.toString();
    if (!input.sourceAccountId && !parentAccountId) {
      throw createStatusError(400, 'targetAccountId does not have a parent account');
    }
    const sourceAccountId = input.sourceAccountId
      ? parseObjectId(input.sourceAccountId, 'sourceAccountId')
      : parseObjectId(parentAccountId as string, 'sourceAccountId');
    const sourceAccount = await getAccountOrThrow(sourceAccountId);

    assertQuotaRequestAccounts({
      periodId: period._id,
      sourceAccount,
      targetAccount,
    });
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, periodId);
    assertManagedQuotaAccountInScope(
      quotaAccountScopeIds,
      targetAccount._id,
      'targetAccountId is outside the allowed scope',
    );
    assertQuotaAccountInScope(
      quotaAccountScopeIds,
      sourceAccount._id,
      'sourceAccountId is outside the allowed scope',
    );

    const quotaRequest = await QuotaRequest.create({
      periodId,
      sourceAccountId,
      targetAccountId,
      requestedByUserId: getRequestUserId(req),
      reviewedByUserId: null,
      amount: input.amount,
      reason: input.reason,
      status: 'pending',
      requestedAt: new Date(),
    });

    await writeQuotaActivityLog(req, {
      action: 'quota_request.create',
      resourceType: 'quota_request',
      resourceId: quotaRequest._id.toString(),
      metadata: {
        periodId: periodId.toString(),
        sourceAccountId: sourceAccountId.toString(),
        targetAccountId: targetAccountId.toString(),
        amount: input.amount,
      },
    });

    const storedRequest = await QuotaRequest.findById(quotaRequest._id)
      .lean<QuotaRequestRecord>()
      .orFail();

    return res.status(201).json({
      request: sanitizeQuotaRequest(storedRequest, { sourceAccount, targetAccount }),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[createAdminQuotaRequest]');
  }
}

export async function approveAdminQuotaRequest(req: Request, res: Response) {
  try {
    const requestId = parseObjectId(req.params.requestId, 'requestId');
    const input = quotaRequestDecisionSchema.parse(req.body);
    const existingRequest = await QuotaRequest.findById(requestId).lean<QuotaRequestRecord | null>();

    if (!existingRequest) {
      throw createStatusError(404, 'Quota request not found');
    }

    if (existingRequest.status !== 'pending') {
      throw createStatusError(409, 'Quota request is not pending');
    }

    const periodId = parseObjectId(existingRequest.periodId.toString(), 'periodId');
    const sourceAccountId = parseObjectId(
      existingRequest.sourceAccountId.toString(),
      'sourceAccountId',
    );
    const targetAccountId = parseObjectId(
      existingRequest.targetAccountId.toString(),
      'targetAccountId',
    );
    const [period, sourceAccount, targetAccount] = await Promise.all([
      getPeriodOrThrow(periodId),
      getAccountOrThrow(sourceAccountId),
      getAccountOrThrow(targetAccountId),
    ]);

    assertQuotaRequestAccounts({
      periodId: period._id,
      sourceAccount,
      targetAccount,
    });
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, periodId);
    assertManagedQuotaAccountInScope(
      quotaAccountScopeIds,
      sourceAccount._id,
      'sourceAccountId is outside the allowed review scope',
    );

    const appliedAllocation: AppliedQuotaAllocation = await applyQuotaAllocation({
      req,
      periodId,
      fromAccount: sourceAccount,
      toAccount: targetAccount,
      amount: existingRequest.amount,
      reason: existingRequest.reason,
      sourceType: 'manager_action',
      sourceId: requestId.toString(),
    });
    const approvedRequest = await QuotaRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          reviewedByUserId: getRequestUserId(req),
          fulfilledAllocationId: appliedAllocation.allocation._id,
          status: 'approved',
          reviewReason: input.reason,
          reviewedAt: new Date(),
        },
      },
      { new: true },
    ).lean<QuotaRequestRecord | null>();

    if (!approvedRequest) {
      throw createStatusError(404, 'Quota request not found');
    }

    await writeQuotaActivityLog(req, {
      action: 'quota_request.approve',
      resourceType: 'quota_request',
      resourceId: requestId.toString(),
      metadata: {
        periodId: periodId.toString(),
        sourceAccountId: sourceAccountId.toString(),
        targetAccountId: targetAccountId.toString(),
        amount: existingRequest.amount,
        allocationId: appliedAllocation.allocation._id.toString(),
      },
    });

    return res.status(200).json({
      request: sanitizeQuotaRequest(approvedRequest, {
        sourceAccount: appliedAllocation.fromAccount,
        targetAccount: appliedAllocation.toAccount,
      }),
      allocation: sanitizeAllocation(appliedAllocation.allocation),
      sourceAccount: sanitizeAccount(appliedAllocation.fromAccount),
      targetAccount: sanitizeAccount(appliedAllocation.toAccount),
    });
  } catch (error) {
    return handleQuotaError(error, res, '[approveAdminQuotaRequest]');
  }
}

export async function rejectAdminQuotaRequest(req: Request, res: Response) {
  try {
    const requestId = parseObjectId(req.params.requestId, 'requestId');
    const input = quotaRequestDecisionSchema.parse(req.body);
    const existingRequest = await QuotaRequest.findById(requestId).lean<QuotaRequestRecord | null>();

    if (!existingRequest) {
      throw createStatusError(404, 'Quota request not found');
    }

    if (existingRequest.status !== 'pending') {
      throw createStatusError(409, 'Quota request is not pending');
    }
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(
      req,
      parseObjectId(existingRequest.periodId.toString(), 'periodId'),
    );
    assertManagedQuotaAccountInScope(
      quotaAccountScopeIds,
      existingRequest.sourceAccountId,
      'sourceAccountId is outside the allowed review scope',
    );

    const rejectedRequest = await QuotaRequest.findByIdAndUpdate(
      requestId,
      {
        $set: {
          reviewedByUserId: getRequestUserId(req),
          status: 'rejected',
          reviewReason: input.reason,
          reviewedAt: new Date(),
        },
      },
      { new: true },
    ).lean<QuotaRequestRecord | null>();

    if (!rejectedRequest) {
      throw createStatusError(404, 'Quota request not found');
    }

    await writeQuotaActivityLog(req, {
      action: 'quota_request.reject',
      resourceType: 'quota_request',
      resourceId: requestId.toString(),
      metadata: {
        periodId: rejectedRequest.periodId.toString(),
        sourceAccountId: rejectedRequest.sourceAccountId.toString(),
        targetAccountId: rejectedRequest.targetAccountId.toString(),
        amount: rejectedRequest.amount,
      },
    });

    return res.status(200).json({ request: sanitizeQuotaRequest(rejectedRequest) });
  } catch (error) {
    return handleQuotaError(error, res, '[rejectAdminQuotaRequest]');
  }
}

export async function getAdminQuotaLedger(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const periodId = trimSearch(req.query.periodId);
    const accountId = trimSearch(req.query.accountId);
    const entryType = trimSearch(req.query.entryType);
    const createdAfter = parseOptionalDate(req.query.createdAfter, 'createdAfter');
    const createdBefore = parseOptionalDate(req.query.createdBefore, 'createdBefore');
    const cursorFilter = buildCreatedAtCursorFilter<QuotaLedgerEntryRecord>(
      trimSearch(req.query.cursor),
    );
    const filters: mongoose.FilterQuery<QuotaLedgerEntryRecord>[] = [];
    const parsedPeriodId = periodId ? parseObjectId(periodId, 'periodId') : undefined;
    const quotaAccountScopeIds = await resolveQuotaAccountScopeIds(req, parsedPeriodId);

    if (parsedPeriodId) {
      filters.push({ periodId: parsedPeriodId });
    }

    if (quotaAccountScopeIds != null) {
      filters.push({
        accountId: { $in: toObjectIds(Array.from(quotaAccountScopeIds.visibleAccountIds)) },
      });
    }

    if (accountId) {
      const parsedAccountId = parseObjectId(accountId, 'accountId');
      assertQuotaAccountInScope(
        quotaAccountScopeIds,
        parsedAccountId,
        'accountId is outside the allowed scope',
      );
      filters.push({ accountId: parsedAccountId });
    }

    if (entryType && entryType !== 'all') {
      filters.push({ entryType });
    }

    if (createdAfter || createdBefore) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (createdAfter) {
        createdAt.$gte = createdAfter;
      }
      if (createdBefore) {
        createdAt.$lte = createdBefore;
      }
      filters.push({ createdAt });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const result = await QuotaLedgerEntry.find(filters.length > 0 ? { $and: filters } : {})
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<QuotaLedgerEntryRecord[]>();
    const page = buildPagedResult(result, limit);
    const allocationIds = page.items
      .filter((entry) => entry.entryType === 'allocation' && entry.sourceId)
      .map((entry) => entry.sourceId as string);
    const allocations =
      allocationIds.length > 0
        ? await QuotaAllocation.find({ _id: { $in: toObjectIds(allocationIds) } }).lean<
            QuotaAllocationRecord[]
          >()
        : [];
    const allocationsById = new Map(
      allocations.map((allocation) => [allocation._id.toString(), allocation]),
    );
    const legacyLedgerPairs = buildLegacyLedgerPairs(page.items);
    const accountIds = new Set<string>();
    for (const entry of page.items) {
      accountIds.add(entry.accountId.toString());
      if (entry.counterpartyAccountId) {
        accountIds.add(entry.counterpartyAccountId.toString());
      }
    }
    for (const allocation of allocations) {
      accountIds.add(allocation.fromAccountId.toString());
      accountIds.add(allocation.toAccountId.toString());
    }
    for (const pair of legacyLedgerPairs.values()) {
      accountIds.add(pair.fromAccountId);
      accountIds.add(pair.toAccountId);
    }
    const accounts =
      accountIds.size > 0
        ? await QuotaAccount.find({ _id: { $in: toObjectIds(Array.from(accountIds)) } }).lean<
            QuotaAccountRecord[]
          >()
        : [];
    const accountsById = new Map(accounts.map((account) => [account._id.toString(), account]));
    const accountScopeMetadata = await buildAccountScopeMetadata(accounts);

    return res.status(200).json({
      ledger: page.items.map((entry) => {
        const account = accountsById.get(entry.accountId.toString()) ?? null;
        const allocation =
          entry.sourceId != null ? (allocationsById.get(entry.sourceId) ?? null) : null;
        const legacyPair = legacyLedgerPairs.get(entry._id.toString()) ?? null;
        let fromAccount: QuotaAccountRecord | null = null;
        let toAccount: QuotaAccountRecord | null = null;
        let counterpartyAccount: QuotaAccountRecord | null = null;

        if (allocation != null) {
          fromAccount = accountsById.get(allocation.fromAccountId.toString()) ?? null;
          toAccount = accountsById.get(allocation.toAccountId.toString()) ?? null;
        } else if (legacyPair != null) {
          fromAccount = accountsById.get(legacyPair.fromAccountId) ?? null;
          toAccount = accountsById.get(legacyPair.toAccountId) ?? null;
        }

        if (entry.counterpartyAccountId) {
          counterpartyAccount = accountsById.get(entry.counterpartyAccountId.toString()) ?? null;
        } else if (fromAccount != null || toAccount != null) {
          const entryAccountId = entry.accountId.toString();
          if (fromAccount?._id.toString() === entryAccountId) {
            counterpartyAccount = toAccount;
          } else if (toAccount?._id.toString() === entryAccountId) {
            counterpartyAccount = fromAccount;
          }
        }

        return sanitizeLedgerEntry(entry, {
          account,
          counterpartyAccount,
          allocation:
            allocation != null || legacyPair != null
              ? {
                  fromAccount,
                  toAccount,
                }
              : null,
          accountMetadata: account
            ? accountScopeMetadata.get(`${account.scopeType}:${account.scopeId ?? ''}`)
            : undefined,
          counterpartyAccountMetadata: counterpartyAccount
            ? accountScopeMetadata.get(
                `${counterpartyAccount.scopeType}:${counterpartyAccount.scopeId ?? ''}`,
              )
            : undefined,
          fromAccountMetadata: fromAccount
            ? accountScopeMetadata.get(`${fromAccount.scopeType}:${fromAccount.scopeId ?? ''}`)
            : undefined,
          toAccountMetadata: toAccount
            ? accountScopeMetadata.get(`${toAccount.scopeType}:${toAccount.scopeId ?? ''}`)
            : undefined,
        });
      }),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return handleQuotaError(error, res, '[getAdminQuotaLedger]');
  }
}
