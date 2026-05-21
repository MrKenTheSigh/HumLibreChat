import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { SENSITIVE_RULE_CODES } from '../sensitiveInformation';
import type { SensitiveRuleCode } from '../sensitiveInformation';
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

const { Conversation, Message, User } = createModels(mongoose);

const sensitiveInformationSummaryFilterSchema = z.object({
  ruleCode: z.enum(SENSITIVE_RULE_CODES).optional(),
});

const sensitiveInformationMessageFilterSchema = z.object({
  ruleCode: z.enum(SENSITIVE_RULE_CODES).optional(),
  outcome: z.enum(['submitted', 'blocked', 'all']).optional(),
});

const sensitiveSummaryCursorSchema = z.object({
  totalCount: z.number().finite().nonnegative(),
  userId: z.string().min(1),
});

type SensitiveSummaryCursor = z.infer<typeof sensitiveSummaryCursorSchema>;

type SensitiveSummaryRecord = {
  user: string;
  totalCount: number;
  submittedCount: number;
  blockedCount: number;
  messageCount: number;
  submittedMessageCount: number;
  blockedMessageCount: number;
  ruleSummaries: Array<{
    ruleCode: string;
    label: string;
    count: number;
    submittedCount: number;
    blockedCount: number;
    messageCount: number;
    submittedMessageCount: number;
    blockedMessageCount: number;
  }>;
};

type SensitiveUserSummaryRecord = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

type SensitiveMessageRuleMatch = {
  ruleCode: SensitiveRuleCode;
  label: string;
  count: number;
};

type SensitiveMessageRecord = {
  _id: mongoose.Types.ObjectId;
  messageId: string;
  conversationId: string;
  user: string;
  sender?: string | null;
  text?: string | null;
  isCreatedByUser: boolean;
  finish_reason?: string | null;
  metadata?: {
    sensitiveInformationPolicy?: {
      blocked?: boolean;
    };
  } | null;
  sensitiveDetection?: {
    totalCount: number;
    ruleMatches: SensitiveMessageRuleMatch[];
    evaluatedAt?: Date;
    version?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
};

type SensitiveConversationRecord = {
  conversationId: string;
  title?: string | null;
  endpoint?: string | null;
  model?: string | null;
};

type SensitiveInformationQueryRange = {
  startAt: Date;
  endAt: Date;
};

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function getLocalDayStart(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 0, 0, 0, 0);
}

function getLocalDayEnd(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate(), 23, 59, 59, 999);
}

function parseDateOnly(value: string, fieldName: string): Date | null {
  const match = dateOnlyPattern.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw createStatusError(400, `${fieldName} must be a valid date`);
  }

  return parsed;
}

function parseSensitiveRangeBoundary(
  input: unknown,
  fieldName: string,
  boundary: 'start' | 'end',
): Date | undefined {
  if (typeof input !== 'string' || input.trim() === '') {
    return undefined;
  }

  const trimmed = input.trim();
  const dateOnly = parseDateOnly(trimmed, fieldName);
  if (dateOnly) {
    return boundary === 'start' ? getLocalDayStart(dateOnly) : getLocalDayEnd(dateOnly);
  }

  return parseOptionalDate(trimmed, fieldName);
}

function resolveSensitiveInformationQueryRange(req: Request): SensitiveInformationQueryRange {
  const now = new Date();
  const requestedStartAt = parseSensitiveRangeBoundary(
    req.query.createdAfter,
    'createdAfter',
    'start',
  );
  const requestedEndAt = parseSensitiveRangeBoundary(
    req.query.createdBefore,
    'createdBefore',
    'end',
  );
  const startAt =
    requestedStartAt ?? (requestedEndAt ? getLocalDayStart(requestedEndAt) : getLocalDayStart(now));
  const endAt = requestedEndAt ?? getLocalDayEnd(startAt);

  if (startAt > endAt) {
    throw createStatusError(400, 'createdAfter must be before createdBefore');
  }

  return {
    startAt,
    endAt,
  };
}

function handleAdminSensitiveInformationError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request';
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
    error instanceof Error
      ? error.message
      : 'An unexpected sensitive information request error occurred';
  return res.status(statusCode).json({ message });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveUserSearchIds(userSearch: string): Promise<string[]> {
  const matchedIds = new Set<string>();

  if (mongoose.Types.ObjectId.isValid(userSearch)) {
    matchedIds.add(userSearch);
  }

  const searchPattern = new RegExp(escapeRegExp(userSearch), 'i');
  const users = await User.find({
    $or: [{ email: searchPattern }, { name: searchPattern }, { username: searchPattern }],
  })
    .select('_id')
    .limit(100)
    .lean<Array<Pick<SensitiveUserSummaryRecord, '_id'>>>();

  for (const user of users) {
    matchedIds.add(user._id.toString());
  }

  return Array.from(matchedIds);
}

async function loadSensitiveUserMap(
  userIds: string[],
): Promise<Map<string, { email: string | null; name: string | null; username: string | null }>> {
  const objectIds = userIds
    .filter((userId) => mongoose.Types.ObjectId.isValid(userId))
    .map((userId) => new mongoose.Types.ObjectId(userId));

  if (objectIds.length === 0) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: objectIds } })
    .select('_id email name username')
    .lean<SensitiveUserSummaryRecord[]>();

  return new Map(
    users.map((user) => [
      user._id.toString(),
      {
        email: user.email ?? null,
        name: user.name ?? null,
        username: user.username ?? null,
      },
    ]),
  );
}

function sanitizeSensitiveSummary(
  record: SensitiveSummaryRecord,
  userMap: Map<string, { email: string | null; name: string | null; username: string | null }>,
) {
  const userId = record.user;
  const user = userMap.get(userId);

  return {
    userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    username: user?.username ?? null,
    totalCount: record.totalCount,
    submittedCount: record.submittedCount,
    blockedCount: record.blockedCount,
    messageCount: record.messageCount,
    submittedMessageCount: record.submittedMessageCount,
    blockedMessageCount: record.blockedMessageCount,
    ruleSummaries: record.ruleSummaries,
  };
}

function decodeSensitiveSummaryCursor(cursor: unknown): SensitiveSummaryCursor | null {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return sensitiveSummaryCursorSchema.parse(JSON.parse(decoded));
  } catch {
    throw createStatusError(400, 'Invalid cursor');
  }
}

function encodeSensitiveSummaryCursor(record: SensitiveSummaryRecord): string {
  return Buffer.from(
    JSON.stringify({
      totalCount: record.totalCount,
      userId: record.user,
    } satisfies SensitiveSummaryCursor),
    'utf8',
  ).toString('base64url');
}

function isBlockedSensitiveMessage(message: SensitiveMessageRecord): boolean {
  return (
    message.finish_reason === 'sensitive_information_policy_blocked' ||
    message.metadata?.sensitiveInformationPolicy?.blocked === true
  );
}

function filterRuleMatches(
  message: SensitiveMessageRecord,
  ruleCode?: SensitiveRuleCode,
): SensitiveMessageRuleMatch[] {
  const matches = message.sensitiveDetection?.ruleMatches ?? [];
  return ruleCode ? matches.filter((match) => match.ruleCode === ruleCode) : matches;
}

function sanitizeSensitiveMessage(
  message: SensitiveMessageRecord,
  userMap: Map<string, { email: string | null; name: string | null; username: string | null }>,
  conversationMap: Map<string, SensitiveConversationRecord>,
  ruleCode?: SensitiveRuleCode,
) {
  const user = userMap.get(message.user);
  const conversation = conversationMap.get(message.conversationId);
  const ruleMatches = filterRuleMatches(message, ruleCode);

  return {
    messageId: message.messageId,
    conversationId: message.conversationId,
    conversationTitle: conversation?.title ?? null,
    endpoint: conversation?.endpoint ?? null,
    model: conversation?.model ?? null,
    userId: message.user,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    username: user?.username ?? null,
    sender: message.sender ?? null,
    text: message.text ?? null,
    outcome: isBlockedSensitiveMessage(message) ? 'blocked' : 'submitted',
    totalCount: ruleMatches.reduce((sum, match) => sum + match.count, 0),
    ruleMatches,
    detectedAt: message.sensitiveDetection?.evaluatedAt?.toISOString() ?? null,
    createdAt: message.createdAt?.toISOString() ?? null,
    updatedAt: message.updatedAt?.toISOString() ?? null,
  };
}

async function loadConversationMap(
  conversationIds: string[],
): Promise<Map<string, SensitiveConversationRecord>> {
  const ids = Array.from(new Set(conversationIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Map();
  }

  const conversations = await Conversation.find({ conversationId: { $in: ids } })
    .select('conversationId title endpoint model')
    .lean<SensitiveConversationRecord[]>();

  return new Map(conversations.map((conversation) => [conversation.conversationId, conversation]));
}

export async function getAdminSensitiveInformationSummary(req: Request, res: Response) {
  try {
    const scope = await resolveAdminDataScope(req);
    const scopedUserIds = await resolveScopedUserIds(scope);
    const parsed = sensitiveInformationSummaryFilterSchema.parse({
      ruleCode: trimSearch(req.query.ruleCode),
    });
    const limit = parsePageSize(req.query.limit);
    const cursor = decodeSensitiveSummaryCursor(req.query.cursor);
    const userSearch = trimSearch(req.query.userId);
    const { startAt, endAt } = resolveSensitiveInformationQueryRange(req);
    const filters: mongoose.FilterQuery<SensitiveMessageRecord>[] = [
      { isCreatedByUser: true },
      { 'sensitiveDetection.totalCount': { $gt: 0 } },
      { createdAt: { $gte: startAt, $lte: endAt } },
    ];

    if (userSearch) {
      const matchedUserIds = await resolveUserSearchIds(userSearch);
      filters.push({
        user: matchedUserIds.length > 0 ? { $in: matchedUserIds } : '__no_matching_user__',
      });
    }

    if (scopedUserIds != null) {
      filters.push({ user: { $in: scopedUserIds.map((id) => id.toString()) } });
    }

    if (parsed.ruleCode) {
      filters.push({
        'sensitiveDetection.ruleMatches': {
          $elemMatch: { ruleCode: parsed.ruleCode, count: { $gt: 0 } },
        },
      });
    }

    const records = await Message.aggregate<SensitiveSummaryRecord>([
      { $match: { $and: filters } },
      { $unwind: '$sensitiveDetection.ruleMatches' },
      {
        $match: {
          'sensitiveDetection.ruleMatches.count': { $gt: 0 },
          ...(parsed.ruleCode
            ? { 'sensitiveDetection.ruleMatches.ruleCode': parsed.ruleCode }
            : {}),
        },
      },
      {
        $project: {
          user: 1,
          ruleCode: '$sensitiveDetection.ruleMatches.ruleCode',
          label: '$sensitiveDetection.ruleMatches.label',
          count: '$sensitiveDetection.ruleMatches.count',
          isBlocked: {
            $or: [
              { $eq: ['$finish_reason', 'sensitive_information_policy_blocked'] },
              { $eq: ['$metadata.sensitiveInformationPolicy.blocked', true] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            user: '$user',
            ruleCode: '$ruleCode',
          },
          label: { $first: '$label' },
          count: { $sum: '$count' },
          submittedCount: { $sum: { $cond: ['$isBlocked', 0, '$count'] } },
          blockedCount: { $sum: { $cond: ['$isBlocked', '$count', 0] } },
          messageCount: { $sum: 1 },
          submittedMessageCount: { $sum: { $cond: ['$isBlocked', 0, 1] } },
          blockedMessageCount: { $sum: { $cond: ['$isBlocked', 1, 0] } },
        },
      },
      {
        $project: {
          user: '$_id.user',
          ruleCode: '$_id.ruleCode',
          label: 1,
          count: 1,
          submittedCount: 1,
          blockedCount: 1,
          messageCount: 1,
          submittedMessageCount: 1,
          blockedMessageCount: 1,
        },
      },
      {
        $group: {
          _id: '$user',
          totalCount: { $sum: '$count' },
          submittedCount: { $sum: '$submittedCount' },
          blockedCount: { $sum: '$blockedCount' },
          messageCount: { $sum: '$messageCount' },
          submittedMessageCount: { $sum: '$submittedMessageCount' },
          blockedMessageCount: { $sum: '$blockedMessageCount' },
          ruleSummaries: {
            $push: {
              ruleCode: '$ruleCode',
              label: '$label',
              count: '$count',
              submittedCount: '$submittedCount',
              blockedCount: '$blockedCount',
              messageCount: '$messageCount',
              submittedMessageCount: '$submittedMessageCount',
              blockedMessageCount: '$blockedMessageCount',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          user: '$_id',
          totalCount: 1,
          submittedCount: 1,
          blockedCount: 1,
          messageCount: 1,
          submittedMessageCount: 1,
          blockedMessageCount: 1,
          ruleSummaries: 1,
        },
      },
      ...(cursor
        ? [
            {
              $match: {
                $or: [
                  { totalCount: { $lt: cursor.totalCount } },
                  { totalCount: cursor.totalCount, user: { $gt: cursor.userId } },
                ],
              },
            },
          ]
        : []),
      { $sort: { totalCount: -1, user: 1 } },
      { $limit: limit + 1 },
    ]);

    const pageRecords = records.slice(0, limit);
    const nextCursor =
      records.length > limit
        ? encodeSensitiveSummaryCursor(pageRecords[pageRecords.length - 1])
        : null;

    const userMap = await loadSensitiveUserMap(pageRecords.map((record) => record.user));

    return res.json({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      items: pageRecords.map((record) => sanitizeSensitiveSummary(record, userMap)),
      nextCursor,
    });
  } catch (error) {
    return handleAdminSensitiveInformationError(
      error,
      res,
      '[getAdminSensitiveInformationSummary]',
    );
  }
}

export async function getAdminSensitiveInformationMessages(req: Request, res: Response) {
  try {
    const scope = await resolveAdminDataScope(req);
    const scopedUserIds = await resolveScopedUserIds(scope);
    const parsed = sensitiveInformationMessageFilterSchema.parse({
      ruleCode: trimSearch(req.query.ruleCode),
      outcome: trimSearch(req.query.outcome),
    });
    const limit = parsePageSize(req.query.limit);
    const userId = trimSearch(req.query.userId);
    const { startAt, endAt } = resolveSensitiveInformationQueryRange(req);
    const cursorFilter = buildCreatedAtCursorFilter<SensitiveMessageRecord>(
      trimSearch(req.query.cursor),
    );
    const filters: mongoose.FilterQuery<SensitiveMessageRecord>[] = [
      { isCreatedByUser: true },
      { 'sensitiveDetection.totalCount': { $gt: 0 } },
    ];

    if (userId) {
      filters.push({ user: parseObjectId(userId, 'userId').toString() });
    }

    if (scopedUserIds != null) {
      filters.push({ user: { $in: scopedUserIds.map((id) => id.toString()) } });
    }

    if (parsed.ruleCode) {
      filters.push({
        'sensitiveDetection.ruleMatches': {
          $elemMatch: { ruleCode: parsed.ruleCode, count: { $gt: 0 } },
        },
      });
    }

    if (parsed.outcome === 'blocked') {
      filters.push({
        $or: [
          { finish_reason: 'sensitive_information_policy_blocked' },
          { 'metadata.sensitiveInformationPolicy.blocked': true },
        ],
      });
    } else if (parsed.outcome === 'submitted') {
      filters.push({
        finish_reason: { $ne: 'sensitive_information_policy_blocked' },
        'metadata.sensitiveInformationPolicy.blocked': { $ne: true },
      });
    }

    filters.push({ createdAt: { $gte: startAt, $lte: endAt } });

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const messages = await Message.find({ $and: filters })
      .select(
        [
          'messageId',
          'conversationId',
          'user',
          'sender',
          'text',
          'isCreatedByUser',
          'finish_reason',
          'metadata.sensitiveInformationPolicy',
          'sensitiveDetection',
          'createdAt',
          'updatedAt',
        ].join(' '),
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<SensitiveMessageRecord[]>();

    const { items, nextCursor } = buildPagedResult<SensitiveMessageRecord>(messages, limit);
    const [userMap, conversationMap] = await Promise.all([
      loadSensitiveUserMap(items.map((message) => message.user)),
      loadConversationMap(items.map((message) => message.conversationId)),
    ]);

    return res.json({
      messages: items.map((message) =>
        sanitizeSensitiveMessage(message, userMap, conversationMap, parsed.ruleCode),
      ),
      nextCursor,
    });
  } catch (error) {
    return handleAdminSensitiveInformationError(
      error,
      res,
      '[getAdminSensitiveInformationMessages]',
    );
  }
}
