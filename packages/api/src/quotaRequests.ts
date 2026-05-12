import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parsePageSize,
  trimSearch,
} from './admin/utils';
import { writeRequestActivityLog } from './admin/activityLogs';

const { Department, QuotaAccount, QuotaPeriod, QuotaRequest, User } = createModels(mongoose);

const COMPANY_DEPARTMENT_CODE = 'COMPANY';

const createUserQuotaRequestSchema = z.object({
  amount: z.number().positive('amount must be greater than 0'),
  reason: z.string().trim().min(1, 'reason is required').max(1000, 'reason is too long'),
});

type QuotaPeriodRecord = {
  _id: mongoose.Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  status: 'draft' | 'active' | 'closed';
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

type UserQuotaRecord = {
  _id: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

type DepartmentRecord = {
  _id: mongoose.Types.ObjectId;
  code: string;
};

function getRequestUserId(req: Request): mongoose.Types.ObjectId {
  const user = (req as Request & { user?: { id?: string; _id?: string | mongoose.Types.ObjectId } })
    .user;
  const id = typeof user?.id === 'string' && user.id.length > 0 ? user.id : user?._id?.toString();

  return parseObjectId(id ?? '', 'userId');
}

function handleQuotaRequestError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: error.issues[0]?.message ?? 'Invalid request body' });
  }

  const statusCode =
    error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    logger.error(context, error);
  }

  return res.status(statusCode).json({
    message: error instanceof Error ? error.message : 'An unexpected quota request error occurred',
  });
}

function toOptionalId(value: mongoose.Types.ObjectId | string | null | undefined): string | null {
  return value == null ? null : value.toString();
}

function getAccountLimitCredits(account: QuotaAccountRecord): number {
  return (account.baseAllocatedCredits ?? 0) + (account.extraGrantedCredits ?? 0);
}

function getAccountUsableRemainingCredits(account: QuotaAccountRecord): number {
  return (
    getAccountLimitCredits(account) + (account.bufferCredits ?? 0) - (account.usedCredits ?? 0)
  );
}

function sanitizeAccount(account: QuotaAccountRecord) {
  const limitCredits = getAccountLimitCredits(account);
  const allocatableLimitCredits = limitCredits - (account.reservedCredits ?? 0);
  const usableRemainingCredits = getAccountUsableRemainingCredits(account);

  return {
    id: account._id.toString(),
    periodId: account.periodId.toString(),
    scopeType: account.scopeType,
    scopeId: account.scopeId ?? null,
    scopeLabel: null,
    scopeSecondaryLabel: null,
    department: null,
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

function sanitizeQuotaRequest(
  request: QuotaRequestRecord,
  accountsById: Map<string, QuotaAccountRecord> = new Map(),
) {
  const sourceAccount = accountsById.get(request.sourceAccountId.toString()) ?? null;
  const targetAccount = accountsById.get(request.targetAccountId.toString()) ?? null;

  return {
    id: request._id.toString(),
    periodId: request.periodId.toString(),
    sourceAccountId: request.sourceAccountId.toString(),
    sourceAccount: sourceAccount ? sanitizeAccount(sourceAccount) : null,
    targetAccountId: request.targetAccountId.toString(),
    targetAccount: targetAccount ? sanitizeAccount(targetAccount) : null,
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

async function getActiveQuotaPeriod() {
  const now = new Date();
  const period = await QuotaPeriod.findOne({
    status: 'active',
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean<QuotaPeriodRecord | null>();

  if (!period) {
    throw createStatusError(409, 'No active quota period is available');
  }

  return period;
}

async function getSourceAccountForUser(input: {
  periodId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}) {
  const user = await User.findById(input.userId)
    .select('_id departmentId')
    .lean<UserQuotaRecord | null>();
  if (!user) {
    throw createStatusError(404, 'User not found');
  }

  if (!user.departmentId) {
    throw createStatusError(409, 'User does not belong to a quota-managed department');
  }

  const department = await Department.findById(user.departmentId)
    .select('_id code')
    .lean<DepartmentRecord | null>();
  if (!department) {
    throw createStatusError(404, 'Department not found');
  }

  if (department.code.trim().toUpperCase() === COMPANY_DEPARTMENT_CODE) {
    return QuotaAccount.findOne({
      periodId: input.periodId,
      scopeType: 'company',
      scopeId: 'company',
    }).lean<QuotaAccountRecord | null>();
  }

  return QuotaAccount.findOne({
    periodId: input.periodId,
    scopeType: 'department',
    scopeId: department._id.toString(),
  }).lean<QuotaAccountRecord | null>();
}

async function resolveUserQuotaRequestAccounts(input: {
  periodId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
}) {
  const existingTargetAccount = await QuotaAccount.findOne({
    periodId: input.periodId,
    scopeType: 'user',
    scopeId: input.userId.toString(),
  }).lean<QuotaAccountRecord | null>();

  if (existingTargetAccount) {
    const parentAccountId = existingTargetAccount.parentAccountId?.toString();
    if (!parentAccountId) {
      throw createStatusError(409, 'User quota account does not have a parent account');
    }

    const sourceAccount = await QuotaAccount.findById(
      parentAccountId,
    ).lean<QuotaAccountRecord | null>();
    if (!sourceAccount) {
      throw createStatusError(404, 'Source quota account not found');
    }

    return { sourceAccount, targetAccount: existingTargetAccount };
  }

  const sourceAccount = await getSourceAccountForUser(input);
  if (!sourceAccount) {
    throw createStatusError(409, 'Parent quota account is not available');
  }

  const createdTargetAccount = await QuotaAccount.create({
    periodId: input.periodId,
    scopeType: 'user',
    scopeId: input.userId.toString(),
    parentAccountId: sourceAccount._id,
  });
  const targetAccount = await QuotaAccount.findById(createdTargetAccount._id)
    .lean<QuotaAccountRecord>()
    .orFail();

  return { sourceAccount, targetAccount };
}

async function getRequestAccounts(requests: QuotaRequestRecord[]) {
  const accountIds = new Set<string>();

  for (const request of requests) {
    accountIds.add(request.sourceAccountId.toString());
    accountIds.add(request.targetAccountId.toString());
  }

  const accounts =
    accountIds.size > 0
      ? await QuotaAccount.find({
          _id: { $in: Array.from(accountIds).map((id) => parseObjectId(id, 'accountId')) },
        }).lean<QuotaAccountRecord[]>()
      : [];

  return new Map(accounts.map((account) => [account._id.toString(), account]));
}

export async function getUserQuotaRequests(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    const limit = parsePageSize(req.query.limit);
    const periodId = trimSearch(req.query.periodId);
    const status = trimSearch(req.query.status);
    const cursorFilter = buildCreatedAtCursorFilter<QuotaRequestRecord>(
      trimSearch(req.query.cursor),
    );
    const filters: mongoose.FilterQuery<QuotaRequestRecord>[] = [{ requestedByUserId: userId }];

    if (periodId) {
      filters.push({ periodId: parseObjectId(periodId, 'periodId') });
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

    const results = await QuotaRequest.find({ $and: filters })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<QuotaRequestRecord[]>();
    const page = buildPagedResult(results, limit);
    const accountsById = await getRequestAccounts(page.items);

    return res.status(200).json({
      requests: page.items.map((request) => sanitizeQuotaRequest(request, accountsById)),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return handleQuotaRequestError(error, res, '[getUserQuotaRequests]');
  }
}

export async function createUserQuotaRequest(req: Request, res: Response) {
  try {
    const input = createUserQuotaRequestSchema.parse(req.body);
    const userId = getRequestUserId(req);
    const period = await getActiveQuotaPeriod();
    const { sourceAccount, targetAccount } = await resolveUserQuotaRequestAccounts({
      periodId: period._id,
      userId,
    });
    const existingPendingRequest = await QuotaRequest.findOne({
      periodId: period._id,
      sourceAccountId: sourceAccount._id,
      targetAccountId: targetAccount._id,
      requestedByUserId: userId,
      status: 'pending',
    }).lean<QuotaRequestRecord | null>();

    if (existingPendingRequest) {
      throw createStatusError(409, 'A quota request is already pending');
    }

    const request = await QuotaRequest.create({
      periodId: period._id,
      sourceAccountId: sourceAccount._id,
      targetAccountId: targetAccount._id,
      requestedByUserId: userId,
      reviewedByUserId: null,
      amount: input.amount,
      reason: input.reason,
      status: 'pending',
      requestedAt: new Date(),
    });

    await writeRequestActivityLog(req, {
      action: 'quota_request.user_create',
      resourceType: 'quota_request',
      resourceId: request._id.toString(),
      result: 'success',
      message: '',
      metadata: {
        periodId: period._id.toString(),
        sourceAccountId: sourceAccount._id.toString(),
        targetAccountId: targetAccount._id.toString(),
        amount: input.amount,
      },
    });

    const storedRequest = await QuotaRequest.findById(request._id)
      .lean<QuotaRequestRecord>()
      .orFail();
    const accountsById = new Map([
      [sourceAccount._id.toString(), sourceAccount],
      [targetAccount._id.toString(), targetAccount],
    ]);

    return res.status(201).json({
      request: sanitizeQuotaRequest(storedRequest, accountsById),
    });
  } catch (error) {
    return handleQuotaRequestError(error, res, '[createUserQuotaRequest]');
  }
}
