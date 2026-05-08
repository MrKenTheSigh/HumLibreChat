import crypto from 'crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseOptionalDate,
  parseObjectId,
  parsePageSize,
  trimSearch,
} from './utils';
import { writeRequestActivityLog } from './activityLogs';
import { sendManagerReviewEmail } from './managerReviewEmailSender';

const {
  Department,
  ManagerReviewBatch,
  ManagerReviewItem,
  QuotaAccount,
  QuotaLedgerEntry,
  QuotaPeriod,
  Transaction,
  User,
} = createModels(mongoose);

const MAX_MANAGER_REVIEW_ITEMS = 100;
const MANAGER_REVIEW_EMAIL_MODE = 'dry_run';

const createManagerReviewBatchSchema = z
  .object({
    managerUserId: z.string().trim().min(1, 'managerUserId is required'),
    departmentId: z.string().trim().min(1, 'departmentId is required'),
    cadence: z.enum(['daily', 'weekly']).optional().default('daily'),
    periodStart: z.string().trim().min(1, 'periodStart is required'),
    periodEnd: z.string().trim().min(1, 'periodEnd is required'),
    dueAt: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => {
      const periodStart = new Date(value.periodStart);
      const periodEnd = new Date(value.periodEnd);
      return !Number.isNaN(periodStart.getTime()) && !Number.isNaN(periodEnd.getTime());
    },
    { message: 'periodStart and periodEnd must be valid ISO date strings' },
  )
  .refine(
    (value) => new Date(value.periodStart).getTime() < new Date(value.periodEnd).getTime(),
    { message: 'periodStart must be before periodEnd' },
  )
  .refine(
    (value) => {
      if (!value.dueAt) {
        return true;
      }
      return !Number.isNaN(new Date(value.dueAt).getTime());
    },
    { message: 'dueAt must be a valid ISO date string' },
  );

const managerReviewResponseSchema = z.object({
  responseStatus: z.enum(['ok', 'not_ok']),
  responseText: z.string().trim().max(2000, 'responseText is too long').optional().default(''),
});

const managerReviewTokenSchema = z.object({
  token: z.string().trim().min(1, 'token is required'),
});

type ManagerReviewBatchInput = z.infer<typeof createManagerReviewBatchSchema>;

type ManagerReviewBatchRecord = {
  _id: mongoose.Types.ObjectId;
  batchKey: string;
  managerUserId: mongoose.Types.ObjectId | string;
  departmentId: mongoose.Types.ObjectId | string;
  cadence: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  itemCount: number;
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  quotaPeriodId?: mongoose.Types.ObjectId | string | null;
  quotaAccountId?: mongoose.Types.ObjectId | string | null;
  quotaAllocatedCredits?: number;
  quotaExtraGrantedCredits?: number;
  quotaUsedCredits?: number;
  quotaRemainingCredits?: number;
  quotaBufferCredits?: number;
  quotaWarningCount?: number;
  quotaBlockCount?: number;
  emailTo?: string;
  sentAt?: Date | null;
  reminderSentAt?: Date | null;
  dueAt?: Date | null;
  reviewedAt?: Date | null;
  responseStatus?: 'ok' | 'not_ok' | null;
  responseText?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type ManagerReviewUserRecord = {
  _id: mongoose.Types.ObjectId;
  name?: string | null;
  email?: string;
};

type ManagerReviewDepartmentRecord = {
  _id: mongoose.Types.ObjectId;
  managerUserId?: mongoose.Types.ObjectId | string | null;
};

type ManagerReviewTransactionAggregate = {
  _id: {
    user: mongoose.Types.ObjectId;
    conversationId?: string | null;
  };
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  newestTransactionAt?: Date;
};

type ManagerReviewItemRecord = {
  _id: mongoose.Types.ObjectId;
  batchId: mongoose.Types.ObjectId | string;
  managerUserId: mongoose.Types.ObjectId | string;
  departmentId: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  conversationId?: string | null;
  status: 'pending' | 'ok' | 'not_ok';
  riskLevel: 'normal' | 'attention' | 'high';
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  quotaAccountId?: mongoose.Types.ObjectId | string | null;
  quotaAllocatedCredits?: number;
  quotaExtraGrantedCredits?: number;
  quotaUsedCredits?: number;
  quotaRemainingCredits?: number;
  quotaBufferCredits?: number;
  quotaWarningCount?: number;
  quotaBlockCount?: number;
  newestTransactionAt?: Date | null;
  reviewedAt?: Date | null;
  responseText?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type ManagerReviewEmailPreview = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type QuotaPeriodRecord = {
  _id: mongoose.Types.ObjectId;
};

type QuotaAccountRecord = {
  _id: mongoose.Types.ObjectId;
  periodId: mongoose.Types.ObjectId | string;
  scopeType: string;
  scopeId?: string | null;
  baseAllocatedCredits: number;
  extraGrantedCredits: number;
  usedCredits: number;
  remainingCredits: number;
  bufferCredits: number;
};

type QuotaLedgerCountRecord = {
  _id: {
    accountId: mongoose.Types.ObjectId;
    entryType: 'warning' | 'block';
  };
  count: number;
};

type QuotaSnapshot = {
  quotaAccountId: mongoose.Types.ObjectId | null;
  quotaAllocatedCredits: number;
  quotaExtraGrantedCredits: number;
  quotaUsedCredits: number;
  quotaRemainingCredits: number;
  quotaBufferCredits: number;
  quotaWarningCount: number;
  quotaBlockCount: number;
};

const emptyQuotaSnapshot: QuotaSnapshot = {
  quotaAccountId: null,
  quotaAllocatedCredits: 0,
  quotaExtraGrantedCredits: 0,
  quotaUsedCredits: 0,
  quotaRemainingCredits: 0,
  quotaBufferCredits: 0,
  quotaWarningCount: 0,
  quotaBlockCount: 0,
};

function handleManagerReviewError(error: unknown, res: Response, context: string) {
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
    error instanceof Error ? error.message : 'An unexpected manager review request error occurred';
  return res.status(statusCode).json({ message });
}

function createReplyToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = hashReplyToken(token);
  return { token, hash };
}

function hashReplyToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isReplyTokenValid(token: string, tokenHash: string) {
  const incoming = Buffer.from(hashReplyToken(token), 'hex');
  const expected = Buffer.from(tokenHash, 'hex');

  return incoming.length === expected.length && crypto.timingSafeEqual(incoming, expected);
}

function getManagerReviewUrl(batchId: string, token: string) {
  const path = `/manager-review/${encodeURIComponent(batchId)}?token=${encodeURIComponent(token)}`;
  const domainClient = process.env.DOMAIN_CLIENT?.trim();

  if (!domainClient) {
    return path;
  }

  return new URL(path, domainClient.endsWith('/') ? domainClient : `${domainClient}/`).toString();
}

function buildBatchKey(input: {
  managerUserId: mongoose.Types.ObjectId;
  departmentId: mongoose.Types.ObjectId;
  cadence: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  return [
    input.managerUserId.toString(),
    input.departmentId.toString(),
    input.cadence,
    input.periodStart.toISOString(),
    input.periodEnd.toISOString(),
  ].join(':');
}

function sanitizeBatch(batch: ManagerReviewBatchRecord) {
  return {
    id: batch._id.toString(),
    batchKey: batch.batchKey,
    managerUserId: batch.managerUserId.toString(),
    departmentId: batch.departmentId.toString(),
    cadence: batch.cadence,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    status: batch.status,
    itemCount: batch.itemCount,
    transactionCount: batch.transactionCount,
    totalTokenValue: batch.totalTokenValue,
    totalRawAmount: batch.totalRawAmount,
    totalInputTokens: batch.totalInputTokens,
    totalWriteTokens: batch.totalWriteTokens,
    totalReadTokens: batch.totalReadTokens,
    quotaPeriodId: batch.quotaPeriodId?.toString() ?? null,
    quotaAccountId: batch.quotaAccountId?.toString() ?? null,
    quotaAllocatedCredits: batch.quotaAllocatedCredits ?? 0,
    quotaExtraGrantedCredits: batch.quotaExtraGrantedCredits ?? 0,
    quotaUsedCredits: batch.quotaUsedCredits ?? 0,
    quotaRemainingCredits: batch.quotaRemainingCredits ?? 0,
    quotaBufferCredits: batch.quotaBufferCredits ?? 0,
    quotaWarningCount: batch.quotaWarningCount ?? 0,
    quotaBlockCount: batch.quotaBlockCount ?? 0,
    emailTo: batch.emailTo ?? '',
    sentAt: batch.sentAt?.toISOString() ?? null,
    reminderSentAt: batch.reminderSentAt?.toISOString() ?? null,
    dueAt: batch.dueAt?.toISOString() ?? null,
    reviewedAt: batch.reviewedAt?.toISOString() ?? null,
    responseStatus: batch.responseStatus ?? null,
    responseText: batch.responseText ?? '',
    createdAt: batch.createdAt?.toISOString() ?? null,
    updatedAt: batch.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeItem(
  item: ManagerReviewItemRecord,
  usersById: Map<string, { email: string; name: string | null }>,
) {
  const userId = item.userId.toString();
  const user = usersById.get(userId);

  return {
    id: item._id.toString(),
    batchId: item.batchId.toString(),
    managerUserId: item.managerUserId.toString(),
    departmentId: item.departmentId.toString(),
    userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    conversationId: item.conversationId ?? null,
    status: item.status,
    riskLevel: item.riskLevel,
    transactionCount: item.transactionCount,
    totalTokenValue: item.totalTokenValue,
    totalRawAmount: item.totalRawAmount,
    totalInputTokens: item.totalInputTokens,
    totalWriteTokens: item.totalWriteTokens,
    totalReadTokens: item.totalReadTokens,
    quotaAccountId: item.quotaAccountId?.toString() ?? null,
    quotaAllocatedCredits: item.quotaAllocatedCredits ?? 0,
    quotaExtraGrantedCredits: item.quotaExtraGrantedCredits ?? 0,
    quotaUsedCredits: item.quotaUsedCredits ?? 0,
    quotaRemainingCredits: item.quotaRemainingCredits ?? 0,
    quotaBufferCredits: item.quotaBufferCredits ?? 0,
    quotaWarningCount: item.quotaWarningCount ?? 0,
    quotaBlockCount: item.quotaBlockCount ?? 0,
    newestTransactionAt: item.newestTransactionAt?.toISOString() ?? null,
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    responseText: item.responseText ?? '',
    createdAt: item.createdAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? null,
  };
}

function buildManagerReviewBatchQuery(req: Request) {
  const managerUserId = trimSearch(req.query.managerUserId);
  const departmentId = trimSearch(req.query.departmentId);
  const status = trimSearch(req.query.status);
  const cadence = trimSearch(req.query.cadence);
  const responseStatus = trimSearch(req.query.responseStatus);
  const periodStart = parseOptionalDate(req.query.periodStart, 'periodStart');
  const periodEnd = parseOptionalDate(req.query.periodEnd, 'periodEnd');
  const cursorFilter = buildCreatedAtCursorFilter<ManagerReviewBatchRecord>(
    trimSearch(req.query.cursor),
  );
  const filters: mongoose.FilterQuery<ManagerReviewBatchRecord>[] = [];

  if (managerUserId) {
    filters.push({ managerUserId: parseObjectId(managerUserId, 'managerUserId') });
  }

  if (departmentId) {
    filters.push({ departmentId: parseObjectId(departmentId, 'departmentId') });
  }

  if (status && status.toLowerCase() !== 'all') {
    filters.push({ status });
  }

  if (cadence && cadence.toLowerCase() !== 'all') {
    filters.push({ cadence });
  }

  if (responseStatus && responseStatus.toLowerCase() !== 'all') {
    filters.push(responseStatus === 'pending' ? { responseStatus: null } : { responseStatus });
  }

  if (periodStart) {
    filters.push({ periodEnd: { $gte: periodStart } });
  }

  if (periodEnd) {
    filters.push({ periodStart: { $lte: periodEnd } });
  }

  if (cursorFilter) {
    filters.push(cursorFilter);
  }

  return filters.length > 0 ? { $and: filters } : {};
}

function sumReviewTotals(items: ManagerReviewTransactionAggregate[]) {
  return items.reduce(
    (totals, item) => ({
      transactionCount: totals.transactionCount + item.transactionCount,
      totalTokenValue: totals.totalTokenValue + item.totalTokenValue,
      totalRawAmount: totals.totalRawAmount + item.totalRawAmount,
      totalInputTokens: totals.totalInputTokens + item.totalInputTokens,
      totalWriteTokens: totals.totalWriteTokens + item.totalWriteTokens,
      totalReadTokens: totals.totalReadTokens + item.totalReadTokens,
    }),
    {
      transactionCount: 0,
      totalTokenValue: 0,
      totalRawAmount: 0,
      totalInputTokens: 0,
      totalWriteTokens: 0,
      totalReadTokens: 0,
    },
  );
}

function buildQuotaSnapshot(
  account: QuotaAccountRecord | null | undefined,
  ledgerCountsByAccountId: Map<string, { warning: number; block: number }>,
): QuotaSnapshot {
  if (!account) {
    return emptyQuotaSnapshot;
  }

  const counts = ledgerCountsByAccountId.get(account._id.toString());
  return {
    quotaAccountId: account._id,
    quotaAllocatedCredits: account.baseAllocatedCredits,
    quotaExtraGrantedCredits: account.extraGrantedCredits,
    quotaUsedCredits: account.usedCredits,
    quotaRemainingCredits: account.remainingCredits,
    quotaBufferCredits: account.bufferCredits,
    quotaWarningCount: counts?.warning ?? 0,
    quotaBlockCount: counts?.block ?? 0,
  };
}

async function getQuotaLedgerCountsByAccountId(accountIds: mongoose.Types.ObjectId[]) {
  if (accountIds.length === 0) {
    return new Map<string, { warning: number; block: number }>();
  }

  const results = (await QuotaLedgerEntry.aggregate([
    {
      $match: {
        accountId: { $in: accountIds },
        entryType: { $in: ['warning', 'block'] },
      },
    },
    {
      $group: {
        _id: {
          accountId: '$accountId',
          entryType: '$entryType',
        },
        count: { $sum: 1 },
      },
    },
  ])) as QuotaLedgerCountRecord[];

  return results.reduce((countsByAccountId, result) => {
    const accountId = result._id.accountId.toString();
    const current = countsByAccountId.get(accountId) ?? { warning: 0, block: 0 };
    countsByAccountId.set(accountId, {
      ...current,
      [result._id.entryType]: result.count,
    });
    return countsByAccountId;
  }, new Map<string, { warning: number; block: number }>());
}

async function getManagerReviewQuotaContext(input: {
  departmentId: mongoose.Types.ObjectId;
  userIds: mongoose.Types.ObjectId[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const period = (await QuotaPeriod.findOne({
    status: { $in: ['active', 'closed'] },
    periodStart: { $lte: input.periodEnd },
    periodEnd: { $gte: input.periodStart },
  }).lean()) as QuotaPeriodRecord | null;

  if (!period) {
    return {
      quotaPeriodId: null,
      departmentSnapshot: emptyQuotaSnapshot,
      userSnapshotsById: new Map<string, QuotaSnapshot>(),
    };
  }

  const userScopeIds = input.userIds.map((userId) => userId.toString());
  const departmentAccount = await QuotaAccount.findOne({
    periodId: period._id,
    scopeType: 'department',
    scopeId: input.departmentId.toString(),
  }).lean<QuotaAccountRecord | null>();
  const userAccounts =
    userScopeIds.length > 0
      ? await QuotaAccount.find({
          periodId: period._id,
          scopeType: 'user',
          scopeId: { $in: userScopeIds },
        }).lean<QuotaAccountRecord[]>()
      : [];
  const accountIds = [
    ...(departmentAccount ? [departmentAccount._id] : []),
    ...userAccounts.map((account) => account._id),
  ];
  const ledgerCountsByAccountId = await getQuotaLedgerCountsByAccountId(accountIds);
  const userSnapshotsById = new Map(
    userAccounts.map((account): [string, QuotaSnapshot] => [
      account.scopeId ?? '',
      buildQuotaSnapshot(account, ledgerCountsByAccountId),
    ]),
  );

  return {
    quotaPeriodId: period._id,
    departmentSnapshot: buildQuotaSnapshot(departmentAccount, ledgerCountsByAccountId),
    userSnapshotsById,
  };
}

function buildManagerReviewEmailPreview(
  batch: ManagerReviewBatchRecord,
  replyToken?: string,
): ManagerReviewEmailPreview {
  const subject = `[HumLibreChat] Manager review ${batch.periodStart.toISOString().slice(0, 10)} - ${batch.periodEnd.toISOString().slice(0, 10)}`;
  const reviewUrl = replyToken ? getManagerReviewUrl(batch._id.toString(), replyToken) : '';
  const text = [
    'A manager review batch is ready.',
    '',
    `Period: ${batch.periodStart.toISOString()} - ${batch.periodEnd.toISOString()}`,
    `Review items: ${batch.itemCount}`,
    `Transactions: ${batch.transactionCount}`,
    `Token value: ${batch.totalTokenValue}`,
    `Raw amount: ${batch.totalRawAmount}`,
    reviewUrl ? `Review link: ${reviewUrl}` : '',
  ].join('\n');
  const html = [
    '<p>A manager review batch is ready.</p>',
    '<ul>',
    `<li>Period: ${batch.periodStart.toISOString()} - ${batch.periodEnd.toISOString()}</li>`,
    `<li>Review items: ${batch.itemCount}</li>`,
    `<li>Transactions: ${batch.transactionCount}</li>`,
    `<li>Token value: ${batch.totalTokenValue}</li>`,
    `<li>Raw amount: ${batch.totalRawAmount}</li>`,
    '</ul>',
    reviewUrl ? `<p><a href="${reviewUrl}">Open manager review</a></p>` : '',
  ].join('');

  return {
    to: batch.emailTo ?? '',
    subject,
    text,
    html,
  };
}

function buildManagerReviewReminderEmail(
  batch: ManagerReviewBatchRecord,
  replyToken?: string,
): ManagerReviewEmailPreview {
  const subject = `[HumLibreChat] Reminder: manager review ${batch.periodStart.toISOString().slice(0, 10)} - ${batch.periodEnd.toISOString().slice(0, 10)}`;
  const reviewUrl = replyToken ? getManagerReviewUrl(batch._id.toString(), replyToken) : '';
  const dueAt = batch.dueAt?.toISOString() ?? 'not set';
  const text = [
    'A manager review batch is overdue.',
    '',
    `Period: ${batch.periodStart.toISOString()} - ${batch.periodEnd.toISOString()}`,
    `Due at: ${dueAt}`,
    `Review items: ${batch.itemCount}`,
    `Transactions: ${batch.transactionCount}`,
    `Token value: ${batch.totalTokenValue}`,
    `Raw amount: ${batch.totalRawAmount}`,
    reviewUrl ? `Review link: ${reviewUrl}` : '',
  ].join('\n');
  const html = [
    '<p>A manager review batch is overdue.</p>',
    '<ul>',
    `<li>Period: ${batch.periodStart.toISOString()} - ${batch.periodEnd.toISOString()}</li>`,
    `<li>Due at: ${dueAt}</li>`,
    `<li>Review items: ${batch.itemCount}</li>`,
    `<li>Transactions: ${batch.transactionCount}</li>`,
    `<li>Token value: ${batch.totalTokenValue}</li>`,
    `<li>Raw amount: ${batch.totalRawAmount}</li>`,
    '</ul>',
    reviewUrl ? `<p><a href="${reviewUrl}">Open manager review</a></p>` : '',
  ].join('');

  return {
    to: batch.emailTo ?? '',
    subject,
    text,
    html,
  };
}

async function assertManagerAndDepartment(input: ManagerReviewBatchInput) {
  const managerUserId = parseObjectId(input.managerUserId, 'managerUserId');
  const departmentId = parseObjectId(input.departmentId, 'departmentId');

  const [manager, department] = await Promise.all([
    User.findById(managerUserId).select('_id email').lean<ManagerReviewUserRecord | null>(),
    Department.findById(departmentId)
      .select('_id managerUserId')
      .lean<ManagerReviewDepartmentRecord | null>(),
  ]);

  if (!manager) {
    throw createStatusError(404, 'managerUserId not found');
  }

  if (!department) {
    throw createStatusError(404, 'departmentId not found');
  }

  const assignedManagerId = department.managerUserId?.toString();
  if (assignedManagerId && assignedManagerId !== managerUserId.toString()) {
    throw createStatusError(400, 'managerUserId is not assigned to this department');
  }

  return { manager, managerUserId, departmentId };
}

async function getDepartmentUserIds(departmentId: mongoose.Types.ObjectId) {
  const users = (await User.find({ departmentId }).select('_id').lean()) as Array<{
    _id: mongoose.Types.ObjectId;
  }>;
  return users.map((user) => user._id);
}

async function aggregateReviewItems(input: {
  userIds: mongoose.Types.ObjectId[];
  periodStart: Date;
  periodEnd: Date;
}) {
  if (input.userIds.length === 0) {
    return [];
  }

  const items = await Transaction.aggregate([
    {
      $match: {
        user: { $in: input.userIds },
        createdAt: {
          $gte: input.periodStart,
          $lt: input.periodEnd,
        },
      },
    },
    {
      $group: {
        _id: {
          user: '$user',
          conversationId: '$conversationId',
        },
        transactionCount: { $sum: 1 },
        totalTokenValue: { $sum: { $ifNull: ['$tokenValue', 0] } },
        totalRawAmount: { $sum: { $ifNull: ['$rawAmount', 0] } },
        totalInputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
        totalWriteTokens: { $sum: { $ifNull: ['$writeTokens', 0] } },
        totalReadTokens: { $sum: { $ifNull: ['$readTokens', 0] } },
        newestTransactionAt: { $max: '$createdAt' },
      },
    },
    {
      $sort: {
        totalTokenValue: -1,
        transactionCount: -1,
      },
    },
    { $limit: MAX_MANAGER_REVIEW_ITEMS },
  ]);

  return items as ManagerReviewTransactionAggregate[];
}

async function getManagerReviewItemsPage(input: {
  batchId: mongoose.Types.ObjectId;
  cursor?: string;
  limit: number;
}) {
  const cursorFilter = buildCreatedAtCursorFilter<ManagerReviewItemRecord>(input.cursor);
  const query: mongoose.FilterQuery<ManagerReviewItemRecord> = cursorFilter
    ? { $and: [{ batchId: input.batchId }, cursorFilter] }
    : { batchId: input.batchId };
  const results = (await ManagerReviewItem.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(input.limit + 1)
    .lean()) as unknown as ManagerReviewItemRecord[];
  const { items, nextCursor } = buildPagedResult(results, input.limit);
  const userIds = [...new Set(items.map((item) => item.userId.toString()))].map((userId) =>
    parseObjectId(userId, 'userId'),
  );
  const users =
    userIds.length > 0
      ? ((await User.find({ _id: { $in: userIds } })
          .select('_id email name')
          .lean()) as ManagerReviewUserRecord[])
      : [];
  const usersById = new Map(
    users.map((user): [string, { email: string; name: string | null }] => [
      user._id.toString(),
      {
        email: user.email ?? '',
        name: user.name ?? null,
      },
    ]),
  );

  return {
    items: items.map((item) => sanitizeItem(item, usersById)),
    nextCursor,
  };
}

export async function createManagerReviewBatch(req: Request, res: Response) {
  try {
    const input = createManagerReviewBatchSchema.parse(req.body);
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    const { manager, managerUserId, departmentId } = await assertManagerAndDepartment(input);
    const batchKey = buildBatchKey({
      managerUserId,
      departmentId,
      cadence: input.cadence,
      periodStart,
      periodEnd,
    });
    const existingBatch = await ManagerReviewBatch.findOne({ batchKey }).select('_id').lean();

    if (existingBatch) {
      throw createStatusError(409, 'Manager review batch already exists for this period');
    }

    const userIds = await getDepartmentUserIds(departmentId);
    const reviewItems = await aggregateReviewItems({ userIds, periodStart, periodEnd });
    const totals = sumReviewTotals(reviewItems);
    const quotaContext = await getManagerReviewQuotaContext({
      departmentId,
      userIds,
      periodStart,
      periodEnd,
    });
    const batchToken = createReplyToken();
    const batch = await ManagerReviewBatch.create({
      batchKey,
      managerUserId,
      departmentId,
      cadence: input.cadence,
      periodStart,
      periodEnd,
      dueAt,
      status: 'generated',
      replyTokenHash: batchToken.hash,
      itemCount: reviewItems.length,
      emailTo: manager.email ?? '',
      ...totals,
      quotaPeriodId: quotaContext.quotaPeriodId,
      ...quotaContext.departmentSnapshot,
    });

    if (reviewItems.length > 0) {
      await ManagerReviewItem.insertMany(
        reviewItems.map((item) => ({
          batchId: batch._id,
          managerUserId,
          departmentId,
          userId: item._id.user,
          conversationId: item._id.conversationId ?? null,
          status: 'pending',
          riskLevel: 'normal',
          replyTokenHash: createReplyToken().hash,
          transactionCount: item.transactionCount,
          totalTokenValue: item.totalTokenValue,
          totalRawAmount: item.totalRawAmount,
          totalInputTokens: item.totalInputTokens,
          totalWriteTokens: item.totalWriteTokens,
          totalReadTokens: item.totalReadTokens,
          ...(quotaContext.userSnapshotsById.get(item._id.user.toString()) ?? emptyQuotaSnapshot),
          newestTransactionAt: item.newestTransactionAt ?? null,
        })),
      );
    }

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.create',
      result: 'success',
      message: 'Manager review batch generated',
      metadata: {
        batchId: batch._id.toString(),
        departmentId: departmentId.toString(),
        managerUserId: managerUserId.toString(),
        itemCount: reviewItems.length,
        quotaPeriodId: quotaContext.quotaPeriodId?.toString() ?? null,
        quotaAccountId: quotaContext.departmentSnapshot.quotaAccountId?.toString() ?? null,
      },
    });

    return res.status(201).json({
      batch: sanitizeBatch(batch),
      replyToken: batchToken.token,
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[createManagerReviewBatch]');
  }
}

export async function getManagerReviewBatches(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const query = buildManagerReviewBatchQuery(req);
    const results = (await ManagerReviewBatch.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()) as unknown as ManagerReviewBatchRecord[];
    const { items, nextCursor } = buildPagedResult(results, limit);

    return res.status(200).json({
      batches: items.map(sanitizeBatch),
      nextCursor,
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[getManagerReviewBatches]');
  }
}

export async function getManagerReviewBatchItems(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const limit = parsePageSize(req.query.limit);
    const batch = await ManagerReviewBatch.findById(batchId).select('_id').lean();

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    const result = await getManagerReviewItemsPage({
      batchId,
      cursor: trimSearch(req.query.cursor),
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleManagerReviewError(error, res, '[getManagerReviewBatchItems]');
  }
}

export async function scanOverdueManagerReviewBatches(req: Request, res: Response) {
  try {
    const scannedAt = new Date();
    const result = await ManagerReviewBatch.updateMany(
      {
        status: { $in: ['generated', 'sent'] },
        dueAt: { $ne: null, $lt: scannedAt },
      },
      {
        $set: {
          status: 'overdue',
        },
      },
    );
    const matchedCount = result.matchedCount ?? 0;
    const modifiedCount = result.modifiedCount ?? 0;
    const overdueCount = await ManagerReviewBatch.countDocuments({ status: 'overdue' });

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: null,
      action: 'manager_review_batch.overdue.scan',
      result: 'success',
      message: 'Manager review overdue batches scanned',
      metadata: {
        matchedCount,
        modifiedCount,
        overdueCount,
        scannedAt: scannedAt.toISOString(),
      },
    });

    return res.status(200).json({
      matchedCount,
      modifiedCount,
      overdueCount,
      scannedAt: scannedAt.toISOString(),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[scanOverdueManagerReviewBatches]');
  }
}

export async function previewManagerReviewBatchEmail(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const batch = (await ManagerReviewBatch.findById(batchId).lean()) as unknown as
      | ManagerReviewBatchRecord
      | null;

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    const email = buildManagerReviewEmailPreview(batch);
    if (!email.to) {
      throw createStatusError(400, 'Manager review batch has no email recipient');
    }

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.email.preview',
      result: 'success',
      message: 'Manager review email preview generated',
      metadata: {
        batchId: batch._id.toString(),
        mode: MANAGER_REVIEW_EMAIL_MODE,
      },
    });

    return res.status(200).json({
      mode: MANAGER_REVIEW_EMAIL_MODE,
      sent: false,
      email,
      batch: sanitizeBatch(batch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[previewManagerReviewBatchEmail]');
  }
}

export async function sendManagerReviewBatchEmail(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const batch = (await ManagerReviewBatch.findById(batchId).lean()) as unknown as
      | ManagerReviewBatchRecord
      | null;

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    assertManagerReviewBatchCanSendEmail(batch);

    const reviewToken =
      process.env.MANAGER_REVIEW_EMAIL_MODE?.toLowerCase() === 'smtp' ? createReplyToken() : null;
    const email = buildManagerReviewEmailPreview(batch, reviewToken?.token);
    if (!email.to) {
      throw createStatusError(400, 'Manager review batch has no email recipient');
    }

    const result = await sendManagerReviewEmail(email);
    const sentAt = new Date();
    const updatedBatch = result.sent
      ? ((await ManagerReviewBatch.findByIdAndUpdate(
          batchId,
          {
            $set: {
              status: 'sent',
              sentAt,
              ...(reviewToken ? { replyTokenHash: reviewToken.hash } : {}),
            },
          },
          { new: true },
        ).lean()) as unknown as ManagerReviewBatchRecord | null)
      : batch;

    if (!updatedBatch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.email.send',
      result: 'success',
      message: result.sent
        ? 'Manager review email sent'
        : 'Manager review email send skipped',
      metadata: {
        batchId: batch._id.toString(),
        mode: result.mode,
        sent: result.sent,
        reason: result.reason ?? null,
      },
    });

    return res.status(200).json({
      mode: result.mode,
      sent: result.sent,
      reason: result.reason ?? null,
      email: result.sent ? email : buildManagerReviewEmailPreview(batch),
      batch: sanitizeBatch(updatedBatch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[sendManagerReviewBatchEmail]');
  }
}

export async function sendManagerReviewBatchReminderEmail(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const batch = (await ManagerReviewBatch.findById(batchId).lean()) as unknown as
      | ManagerReviewBatchRecord
      | null;

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    if (batch.status !== 'overdue') {
      throw createStatusError(409, 'Manager review batch is not overdue');
    }

    const reviewToken =
      process.env.MANAGER_REVIEW_EMAIL_MODE?.toLowerCase() === 'smtp' ? createReplyToken() : null;
    const email = buildManagerReviewReminderEmail(batch, reviewToken?.token);
    if (!email.to) {
      throw createStatusError(400, 'Manager review batch has no email recipient');
    }

    const result = await sendManagerReviewEmail(email);
    const reminderSentAt = new Date();
    const updatedBatch = result.sent
      ? ((await ManagerReviewBatch.findByIdAndUpdate(
          batchId,
          {
            $set: {
              reminderSentAt,
              ...(reviewToken ? { replyTokenHash: reviewToken.hash } : {}),
            },
          },
          { new: true },
        ).lean()) as unknown as ManagerReviewBatchRecord | null)
      : batch;

    if (!updatedBatch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.reminder.email.send',
      result: 'success',
      message: result.sent
        ? 'Manager review reminder email sent'
        : 'Manager review reminder email send skipped',
      metadata: {
        batchId: batch._id.toString(),
        mode: result.mode,
        sent: result.sent,
        reason: result.reason ?? null,
      },
    });

    return res.status(200).json({
      mode: result.mode,
      sent: result.sent,
      reason: result.reason ?? null,
      email: result.sent ? email : buildManagerReviewReminderEmail(batch),
      batch: sanitizeBatch(updatedBatch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[sendManagerReviewBatchReminderEmail]');
  }
}

async function getManagerReviewBatchByValidatedToken(
  batchId: mongoose.Types.ObjectId,
  token: string,
) {
  const batch = (await ManagerReviewBatch.findById(batchId).lean()) as unknown as
    | (ManagerReviewBatchRecord & { replyTokenHash: string })
    | null;

  if (!batch || !isReplyTokenValid(token, batch.replyTokenHash)) {
    throw createStatusError(404, 'Manager review batch not found');
  }

  return batch;
}

function assertManagerReviewBatchCanReceiveResponse(batch: ManagerReviewBatchRecord) {
  if (batch.status === 'cancelled') {
    throw createStatusError(409, 'Manager review batch is cancelled');
  }

  if (batch.status === 'reviewed') {
    throw createStatusError(409, 'Manager review batch is already reviewed');
  }
}

function assertManagerReviewBatchCanSendEmail(batch: ManagerReviewBatchRecord) {
  if (batch.status === 'cancelled') {
    throw createStatusError(409, 'Manager review batch is cancelled');
  }

  if (batch.status === 'reviewed') {
    throw createStatusError(409, 'Manager review batch is already reviewed');
  }
}

export async function getManagerReviewBatchByToken(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const input = managerReviewTokenSchema.parse(req.query);
    const batch = await getManagerReviewBatchByValidatedToken(batchId, input.token);

    return res.status(200).json({
      batch: sanitizeBatch(batch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[getManagerReviewBatchByToken]');
  }
}

export async function getManagerReviewBatchItemsByToken(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const input = managerReviewTokenSchema.parse(req.query);
    await getManagerReviewBatchByValidatedToken(batchId, input.token);
    const result = await getManagerReviewItemsPage({
      batchId,
      cursor: trimSearch(req.query.cursor),
      limit: parsePageSize(req.query.limit),
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleManagerReviewError(error, res, '[getManagerReviewBatchItemsByToken]');
  }
}

export async function submitManagerReviewBatchResponseByToken(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const tokenInput = managerReviewTokenSchema.parse(req.query);
    const input = managerReviewResponseSchema.parse(req.body);
    const existingBatch = await getManagerReviewBatchByValidatedToken(batchId, tokenInput.token);
    assertManagerReviewBatchCanReceiveResponse(existingBatch);

    const reviewedAt = new Date();
    const batch = (await ManagerReviewBatch.findByIdAndUpdate(
      batchId,
      {
        $set: {
          status: 'reviewed',
          responseStatus: input.responseStatus,
          responseText: input.responseText,
          reviewedAt,
        },
      },
      { new: true },
    ).lean()) as unknown as ManagerReviewBatchRecord | null;

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    await ManagerReviewItem.updateMany(
      { batchId, status: 'pending' },
      {
        $set: {
          status: input.responseStatus,
          responseText: input.responseText,
          reviewedAt,
        },
      },
    );

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.response.submit_by_token',
      result: 'success',
      message: 'Manager review response submitted by token',
      metadata: {
        batchId: batch._id.toString(),
        responseStatus: input.responseStatus,
      },
    });

    return res.status(200).json({
      batch: sanitizeBatch(batch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[submitManagerReviewBatchResponseByToken]');
  }
}

export async function submitManagerReviewBatchResponse(req: Request, res: Response) {
  try {
    const batchId = parseObjectId(req.params.batchId, 'batchId');
    const input = managerReviewResponseSchema.parse(req.body);
    const existingBatch = (await ManagerReviewBatch.findById(batchId).lean()) as unknown as
      | ManagerReviewBatchRecord
      | null;

    if (!existingBatch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    assertManagerReviewBatchCanReceiveResponse(existingBatch);

    const reviewedAt = new Date();
    const batch = (await ManagerReviewBatch.findByIdAndUpdate(
      batchId,
      {
        $set: {
          status: 'reviewed',
          responseStatus: input.responseStatus,
          responseText: input.responseText,
          reviewedAt,
        },
      },
      { new: true },
    ).lean()) as unknown as ManagerReviewBatchRecord | null;

    if (!batch) {
      throw createStatusError(404, 'Manager review batch not found');
    }

    await ManagerReviewItem.updateMany(
      { batchId, status: 'pending' },
      {
        $set: {
          status: input.responseStatus,
          responseText: input.responseText,
          reviewedAt,
        },
      },
    );

    await writeRequestActivityLog(req, {
      resourceType: 'manager_review_batch',
      resourceId: batch._id.toString(),
      action: 'manager_review_batch.response.submit',
      result: 'success',
      message: 'Manager review response submitted',
      metadata: {
        batchId: batch._id.toString(),
        responseStatus: input.responseStatus,
      },
    });

    return res.status(200).json({
      batch: sanitizeBatch(batch),
    });
  } catch (error) {
    return handleManagerReviewError(error, res, '[submitManagerReviewBatchResponse]');
  }
}
