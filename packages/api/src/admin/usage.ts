import mongoose from 'mongoose';
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

const { Transaction, User } = createModels(mongoose);

type AdminTransactionRecord = {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId | string;
  conversationId?: string;
  tokenType: 'prompt' | 'completion' | 'credits';
  model?: string;
  context?: string;
  rawAmount?: number;
  tokenValue?: number;
  rate?: number;
  rateDetail?: Record<string, number>;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  createdAt?: Date;
};

type AdminUserSummaryRecord = {
  _id: mongoose.Types.ObjectId;
  email: string;
  name?: string;
};

type AdminUsageSummaryAggregate = {
  _id: null;
  transactionCount: number;
  uniqueUsers: Array<mongoose.Types.ObjectId | string>;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  newestTransactionAt?: Date;
  oldestTransactionAt?: Date;
};

function handleAdminError(error: unknown, res: Response, context: string) {
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

function parseTokenType(input: unknown): AdminTransactionRecord['tokenType'] | undefined {
  const tokenType = trimSearch(input);
  if (!tokenType || tokenType.toLowerCase() === 'all') {
    return undefined;
  }

  if (tokenType === 'prompt' || tokenType === 'completion' || tokenType === 'credits') {
    return tokenType;
  }

  throw createStatusError(400, 'tokenType must be one of prompt, completion, or credits');
}

function buildTransactionQuery(req: Request): mongoose.FilterQuery<AdminTransactionRecord> {
  const userId = trimSearch(req.query.userId);
  const model = trimSearch(req.query.model);
  const context = trimSearch(req.query.context);
  const tokenType = parseTokenType(req.query.tokenType);
  const dateFrom = parseOptionalDate(req.query.dateFrom, 'dateFrom');
  const dateTo = parseOptionalDate(req.query.dateTo, 'dateTo');
  const cursorFilter = buildCreatedAtCursorFilter<AdminTransactionRecord>(
    trimSearch(req.query.cursor),
  );
  const filters: mongoose.FilterQuery<AdminTransactionRecord>[] = [];

  if (userId) {
    filters.push({ user: parseObjectId(userId, 'userId') });
  }

  if (model && model.toLowerCase() !== 'all') {
    filters.push({ model });
  }

  if (context && context.toLowerCase() !== 'all') {
    filters.push({ context });
  }

  if (tokenType) {
    filters.push({ tokenType });
  }

  if (dateFrom || dateTo) {
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (dateFrom) {
      createdAt.$gte = dateFrom;
    }
    if (dateTo) {
      createdAt.$lte = dateTo;
    }
    filters.push({ createdAt });
  }

  if (cursorFilter) {
    filters.push(cursorFilter);
  }

  return filters.length > 0 ? { $and: filters } : {};
}

async function loadUserMap(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { email: string | null; name: string | null }>();
  }

  const users = await User.find({
    _id: { $in: userIds.map((userId) => parseObjectId(userId, 'userId')) },
  })
    .select('_id email name')
    .lean<AdminUserSummaryRecord[]>();

  return new Map<string, { email: string | null; name: string | null }>(
    users.map((user): [string, { email: string | null; name: string | null }] => [
      user._id.toString(),
      {
        email: user.email ?? null,
        name: user.name ?? null,
      },
    ]),
  );
}

function sanitizeTransaction(
  transaction: AdminTransactionRecord,
  userMap: Map<string, { email: string | null; name: string | null }>,
) {
  const userId = String(transaction.user);
  const user = userMap.get(userId);

  return {
    id: transaction._id.toString(),
    userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    conversationId: transaction.conversationId ?? null,
    tokenType: transaction.tokenType,
    model: transaction.model ?? null,
    context: transaction.context ?? null,
    rawAmount: typeof transaction.rawAmount === 'number' ? transaction.rawAmount : null,
    tokenValue: typeof transaction.tokenValue === 'number' ? transaction.tokenValue : null,
    rate: typeof transaction.rate === 'number' ? transaction.rate : null,
    rateDetail: transaction.rateDetail ?? null,
    inputTokens: typeof transaction.inputTokens === 'number' ? transaction.inputTokens : null,
    writeTokens: typeof transaction.writeTokens === 'number' ? transaction.writeTokens : null,
    readTokens: typeof transaction.readTokens === 'number' ? transaction.readTokens : null,
    createdAt: transaction.createdAt?.toISOString() ?? null,
  };
}

export async function getAdminTransactions(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const query = buildTransactionQuery(req);
    const transactions = await Transaction.find(query)
      .select(
        '_id user conversationId tokenType model context rawAmount tokenValue rate rateDetail inputTokens writeTokens readTokens createdAt',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<AdminTransactionRecord[]>();

    const { items, nextCursor } = buildPagedResult<AdminTransactionRecord>(transactions, limit);
    const userMap = await loadUserMap(
      Array.from(new Set(items.map((transaction) => String(transaction.user)))).filter(Boolean),
    );

    return res.status(200).json({
      transactions: items.map((transaction) => sanitizeTransaction(transaction, userMap)),
      nextCursor,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminTransactions]');
  }
}

export async function getAdminUsageSummary(req: Request, res: Response) {
  try {
    const query = buildTransactionQuery(req);
    const results = await Transaction.aggregate<AdminUsageSummaryAggregate>([
      { $match: query },
      {
        $group: {
          _id: null,
          transactionCount: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' },
          totalTokenValue: { $sum: { $ifNull: ['$tokenValue', 0] } },
          totalRawAmount: { $sum: { $ifNull: ['$rawAmount', 0] } },
          totalInputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          totalWriteTokens: { $sum: { $ifNull: ['$writeTokens', 0] } },
          totalReadTokens: { $sum: { $ifNull: ['$readTokens', 0] } },
          newestTransactionAt: { $max: '$createdAt' },
          oldestTransactionAt: { $min: '$createdAt' },
        },
      },
    ]);

    const summary = results[0];

    return res.status(200).json({
      transactionCount: summary?.transactionCount ?? 0,
      uniqueUsers: summary?.uniqueUsers?.length ?? 0,
      totalTokenValue: summary?.totalTokenValue ?? 0,
      totalRawAmount: summary?.totalRawAmount ?? 0,
      totalInputTokens: summary?.totalInputTokens ?? 0,
      totalWriteTokens: summary?.totalWriteTokens ?? 0,
      totalReadTokens: summary?.totalReadTokens ?? 0,
      newestTransactionAt: summary?.newestTransactionAt?.toISOString() ?? null,
      oldestTransactionAt: summary?.oldestTransactionAt?.toISOString() ?? null,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUsageSummary]');
  }
}
