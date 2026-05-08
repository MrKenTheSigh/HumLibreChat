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
import { resolveAdminDataScope, resolveScopedUserIds } from './scope';

const { Transaction, User } = createModels(mongoose);
const DEFAULT_USAGE_EXPORT_LIMIT = 10000;

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

type AdminUsageMemberAggregate = {
  _id: mongoose.Types.ObjectId | string;
  transactionCount: number;
  totalTokenValue: number;
  totalRawAmount: number;
  totalInputTokens: number;
  totalWriteTokens: number;
  totalReadTokens: number;
  totalTokens: number;
  newestTransactionAt?: Date;
};

type UsageMemberCursor = {
  totalTokens: number;
  transactionCount: number;
  userId: string;
};

type AdminUsageMembersCountAggregate = {
  count: number;
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

function decodeUsageMemberCursor(cursor: string): UsageMemberCursor {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as UsageMemberCursor;
    if (
      typeof decoded?.totalTokens !== 'number' ||
      typeof decoded?.transactionCount !== 'number' ||
      typeof decoded?.userId !== 'string' ||
      decoded.userId.length === 0
    ) {
      throw new Error('Invalid cursor shape');
    }

    parseObjectId(decoded.userId, 'cursor.userId');
    return decoded;
  } catch (_error) {
    throw createStatusError(400, 'Invalid cursor');
  }
}

function encodeUsageMemberCursor(member: AdminUsageMemberAggregate): string {
  return Buffer.from(
    JSON.stringify({
      totalTokens: member.totalTokens,
      transactionCount: member.transactionCount,
      userId: String(member._id),
    }),
  ).toString('base64');
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) {
    return '';
  }

  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function getUsageExportLimit() {
  const parsed = Number(process.env.ADMIN_USAGE_EXPORT_LIMIT ?? DEFAULT_USAGE_EXPORT_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_USAGE_EXPORT_LIMIT;
}

function sendCsv(res: Response, filename: string, csv: string, truncated: boolean, limit: number) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Export-Truncated', truncated ? 'true' : 'false');
  res.setHeader('X-Export-Limit', String(limit));
  return res.status(200).send(`\uFEFF${csv}\n`);
}

function sendExportCount(res: Response, count: number) {
  return res.status(200).json({
    count,
    limit: getUsageExportLimit(),
  });
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

async function resolveUsageScopedUserIds(req: Request) {
  const scope = await resolveAdminDataScope(req);
  const requestedDepartmentId = trimSearch(req.query.departmentId);

  if (!requestedDepartmentId) {
    return resolveScopedUserIds(scope);
  }

  const departmentId = parseObjectId(requestedDepartmentId, 'departmentId');

  if (scope.type === 'department' && !departmentId.equals(scope.departmentId)) {
    throw createStatusError(403, 'departmentId is outside the allowed scope');
  }

  return resolveScopedUserIds({
    type: 'department',
    departmentId,
  });
}

async function buildTransactionQuery(
  req: Request,
  options?: { includeCursor?: boolean },
): Promise<mongoose.FilterQuery<AdminTransactionRecord>> {
  const includeCursor = options?.includeCursor ?? true;
  const scopedUserIds = await resolveUsageScopedUserIds(req);
  const userId = trimSearch(req.query.userId);
  const model = trimSearch(req.query.model);
  const context = trimSearch(req.query.context);
  const tokenType = parseTokenType(req.query.tokenType);
  const dateFrom = parseOptionalDate(req.query.dateFrom, 'dateFrom');
  const dateTo = parseOptionalDate(req.query.dateTo, 'dateTo');
  const cursorFilter = includeCursor
    ? buildCreatedAtCursorFilter<AdminTransactionRecord>(trimSearch(req.query.cursor))
    : null;
  const filters: mongoose.FilterQuery<AdminTransactionRecord>[] = [];

  if (userId) {
    filters.push({ user: parseObjectId(userId, 'userId') });
  }

  if (scopedUserIds != null) {
    filters.push({ user: { $in: scopedUserIds } });
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

function buildMemberUsagePipeline(
  query: mongoose.FilterQuery<AdminTransactionRecord>,
  limit: number,
  cursor?: string,
  options?: { includeExtraPageItem?: boolean },
): mongoose.PipelineStage[] {
  const resultLimit = options?.includeExtraPageItem === false ? limit : limit + 1;
  const decodedCursor = cursor ? decodeUsageMemberCursor(cursor) : null;
  const cursorUserId = decodedCursor ? parseObjectId(decodedCursor.userId, 'cursor.userId') : null;
  const cursorMatch: mongoose.PipelineStage[] =
    decodedCursor && cursorUserId
      ? [
          {
            $match: {
              $or: [
                { totalTokens: { $lt: decodedCursor.totalTokens } },
                {
                  totalTokens: decodedCursor.totalTokens,
                  transactionCount: { $lt: decodedCursor.transactionCount },
                },
                {
                  totalTokens: decodedCursor.totalTokens,
                  transactionCount: decodedCursor.transactionCount,
                  _id: { $gt: cursorUserId },
                },
              ],
            },
          },
        ]
      : [];

  return [
    { $match: query },
    {
      $group: {
        _id: '$user',
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
      $addFields: {
        totalTokens: {
          $add: ['$totalInputTokens', '$totalWriteTokens', '$totalReadTokens'],
        },
      },
    },
    ...cursorMatch,
    { $sort: { totalTokens: -1, transactionCount: -1, _id: 1 } },
    { $limit: resultLimit },
  ];
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

function sanitizeUsageMember(
  member: AdminUsageMemberAggregate,
  userMap: Map<string, { email: string | null; name: string | null }>,
) {
  const userId = String(member._id);
  const user = userMap.get(userId);

  return {
    userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    transactionCount: member.transactionCount,
    totalTokenValue: member.totalTokenValue,
    totalRawAmount: member.totalRawAmount,
    totalInputTokens: member.totalInputTokens,
    totalWriteTokens: member.totalWriteTokens,
    totalReadTokens: member.totalReadTokens,
    totalTokens: member.totalTokens,
    newestTransactionAt: member.newestTransactionAt?.toISOString() ?? null,
  };
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
    const query = await buildTransactionQuery(req);
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
    const query = await buildTransactionQuery(req);
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

export async function getAdminUsageMembers(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const query = await buildTransactionQuery(req, { includeCursor: false });
    const members = await Transaction.aggregate<AdminUsageMemberAggregate>(
      buildMemberUsagePipeline(query, limit, trimSearch(req.query.cursor)),
    );
    const hasNextPage = members.length > limit;
    const items = hasNextPage ? members.slice(0, limit) : members;
    const userMap = await loadUserMap(
      Array.from(new Set(items.map((member) => String(member._id)))).filter(Boolean),
    );
    const lastItem = items[items.length - 1];

    return res.status(200).json({
      members: items.map((member) => sanitizeUsageMember(member, userMap)),
      nextCursor: hasNextPage && lastItem ? encodeUsageMemberCursor(lastItem) : null,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUsageMembers]');
  }
}

export async function getAdminTransactionsExportCount(req: Request, res: Response) {
  try {
    const query = await buildTransactionQuery(req, { includeCursor: false });
    const count = await Transaction.countDocuments(query);

    return sendExportCount(res, count);
  } catch (error) {
    return handleAdminError(error, res, '[getAdminTransactionsExportCount]');
  }
}

export async function getAdminUsageMembersExportCount(req: Request, res: Response) {
  try {
    const query = await buildTransactionQuery(req, { includeCursor: false });
    const results = await Transaction.aggregate<AdminUsageMembersCountAggregate>([
      { $match: query },
      { $group: { _id: '$user' } },
      { $count: 'count' },
    ]);

    return sendExportCount(res, results[0]?.count ?? 0);
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUsageMembersExportCount]');
  }
}

export async function exportAdminTransactionsCsv(req: Request, res: Response) {
  try {
    const exportLimit = getUsageExportLimit();
    const query = await buildTransactionQuery(req, { includeCursor: false });
    const transactions = await Transaction.find(query)
      .select(
        '_id user conversationId tokenType model context rawAmount tokenValue rate rateDetail inputTokens writeTokens readTokens createdAt',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(exportLimit + 1)
      .lean<AdminTransactionRecord[]>();
    const truncated = transactions.length > exportLimit;
    const exportTransactions = truncated ? transactions.slice(0, exportLimit) : transactions;
    const userMap = await loadUserMap(
      Array.from(new Set(exportTransactions.map((transaction) => String(transaction.user)))).filter(
        Boolean,
      ),
    );
    const items = exportTransactions.map((transaction) => sanitizeTransaction(transaction, userMap));

    return sendCsv(
      res,
      'admin-usage-transactions.csv',
      buildCsv(
        [
          'id',
          'userId',
          'userEmail',
          'userName',
          'conversationId',
          'tokenType',
          'model',
          'context',
          'rawAmount',
          'tokenValue',
          'rate',
          'inputTokens',
          'writeTokens',
          'readTokens',
          'createdAt',
        ],
        items.map((transaction) => [
          transaction.id,
          transaction.userId,
          transaction.userEmail,
          transaction.userName,
          transaction.conversationId,
          transaction.tokenType,
          transaction.model,
          transaction.context,
          transaction.rawAmount,
          transaction.tokenValue,
          transaction.rate,
          transaction.inputTokens,
          transaction.writeTokens,
          transaction.readTokens,
          transaction.createdAt,
        ]),
      ),
      truncated,
      exportLimit,
    );
  } catch (error) {
    return handleAdminError(error, res, '[exportAdminTransactionsCsv]');
  }
}

export async function exportAdminUsageMembersCsv(req: Request, res: Response) {
  try {
    const exportLimit = getUsageExportLimit();
    const query = await buildTransactionQuery(req, { includeCursor: false });
    const members = await Transaction.aggregate<AdminUsageMemberAggregate>(
      buildMemberUsagePipeline(query, exportLimit),
    );
    const truncated = members.length > exportLimit;
    const exportMembers = truncated ? members.slice(0, exportLimit) : members;
    const userMap = await loadUserMap(
      Array.from(new Set(exportMembers.map((member) => String(member._id)))).filter(Boolean),
    );
    const items = exportMembers.map((member) => sanitizeUsageMember(member, userMap));

    return sendCsv(
      res,
      'admin-usage-members.csv',
      buildCsv(
        [
          'userId',
          'userEmail',
          'userName',
          'transactionCount',
          'totalTokens',
          'totalTokenValue',
          'totalRawAmount',
          'totalInputTokens',
          'totalWriteTokens',
          'totalReadTokens',
          'newestTransactionAt',
        ],
        items.map((member) => [
          member.userId,
          member.userEmail,
          member.userName,
          member.transactionCount,
          member.totalTokens,
          member.totalTokenValue,
          member.totalRawAmount,
          member.totalInputTokens,
          member.totalWriteTokens,
          member.totalReadTokens,
          member.newestTransactionAt,
        ]),
      ),
      truncated,
      exportLimit,
    );
  } catch (error) {
    return handleAdminError(error, res, '[exportAdminUsageMembersCsv]');
  }
}
