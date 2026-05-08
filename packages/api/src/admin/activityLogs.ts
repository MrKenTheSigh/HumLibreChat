import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { ActivityLogMetadata, ActivityLogResult } from '@librechat/data-schemas';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parseOptionalDate,
  parsePageSize,
  trimSearch,
} from './utils';
import { hasFullAdminDataAccess } from './scope';

const { ActivityLog } = createModels(mongoose);

type RequestUser = {
  _id?: mongoose.Types.ObjectId | string;
  id?: string;
  role?: string | null;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

type ActivityLogRecord = {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  actorUserId?: mongoose.Types.ObjectId | string | null;
  actorRole?: string | null;
  actorDepartmentId?: mongoose.Types.ObjectId | string | null;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result: ActivityLogResult;
  message?: string;
  metadata?: ActivityLogMetadata;
  requestIp?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type ActivityLogInput = {
  actorUserId?: mongoose.Types.ObjectId | string | null;
  actorRole?: string | null;
  actorDepartmentId?: mongoose.Types.ObjectId | string | null;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result: ActivityLogResult;
  message?: string;
  metadata?: ActivityLogMetadata;
  requestIp?: string | null;
  userAgent?: string | null;
};

const activityLogFilterSchema = z.object({
  result: z.enum(['success', 'failure']).optional(),
});

function getRequestUser(req: Request): RequestUser | undefined {
  return (req as Request & { user?: RequestUser }).user;
}

function getRequestUserId(req: Request): string | null {
  const user = getRequestUser(req);

  if (typeof user?.id === 'string' && user.id.length > 0) {
    return user.id;
  }

  return user?._id?.toString() ?? null;
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getRequestIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

function toOptionalObjectId(
  value: mongoose.Types.ObjectId | string | null | undefined,
  fieldName: string,
): mongoose.Types.ObjectId | null {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  return parseObjectId(value, fieldName);
}

function sanitizeActivityLog(event: ActivityLogRecord) {
  return {
    id: event._id.toString(),
    eventId: event.eventId,
    actorUserId: event.actorUserId?.toString() ?? null,
    actorRole: event.actorRole ?? null,
    actorDepartmentId: event.actorDepartmentId?.toString() ?? null,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    action: event.action,
    result: event.result,
    message: event.message ?? '',
    metadata: event.metadata ?? {},
    requestIp: event.requestIp ?? null,
    userAgent: event.userAgent ?? null,
    createdAt: event.createdAt?.toISOString() ?? null,
    updatedAt: event.updatedAt?.toISOString() ?? null,
  };
}

function handleAdminActivityLogError(error: unknown, res: Response, context: string) {
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
    error instanceof Error ? error.message : 'An unexpected admin activity log request error occurred';
  return res.status(statusCode).json({ message });
}

export function buildActivityLogFromRequest(
  req: Request,
  input: Omit<ActivityLogInput, 'actorUserId' | 'actorRole' | 'actorDepartmentId' | 'requestIp' | 'userAgent'>,
): ActivityLogInput {
  const user = getRequestUser(req);

  return {
    ...input,
    actorUserId: getRequestUserId(req),
    actorRole: user?.role ?? null,
    actorDepartmentId: user?.departmentId ?? null,
    requestIp: getRequestIp(req),
    userAgent: getHeaderValue(req.headers?.['user-agent']),
  };
}

export async function writeActivityLog(input: ActivityLogInput): Promise<void> {
  try {
    await ActivityLog.create({
      actorUserId: toOptionalObjectId(input.actorUserId, 'actorUserId'),
      actorRole: input.actorRole ?? null,
      actorDepartmentId: toOptionalObjectId(input.actorDepartmentId, 'actorDepartmentId'),
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      action: input.action,
      result: input.result,
      message: input.message ?? '',
      metadata: input.metadata ?? {},
      requestIp: input.requestIp ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (error) {
    logger.error('[writeActivityLog]', error);
  }
}

export async function writeRequestActivityLog(
  req: Request,
  input: Omit<ActivityLogInput, 'actorUserId' | 'actorRole' | 'actorDepartmentId' | 'requestIp' | 'userAgent'>,
): Promise<void> {
  await writeActivityLog(buildActivityLogFromRequest(req, input));
}

export async function getAdminActivityLogs(req: Request, res: Response) {
  try {
    const role = getRequestUser(req)?.role;
    if (!hasFullAdminDataAccess(role)) {
      throw createStatusError(403, 'Activity log access role required');
    }

    const parsed = activityLogFilterSchema.parse({
      result: trimSearch(req.query.result),
    });
    const limit = parsePageSize(req.query.limit);
    const actorUserId = trimSearch(req.query.actorUserId);
    const resourceType = trimSearch(req.query.resourceType);
    const resourceId = trimSearch(req.query.resourceId);
    const action = trimSearch(req.query.action);
    const createdAfter = parseOptionalDate(req.query.createdAfter, 'createdAfter');
    const createdBefore = parseOptionalDate(req.query.createdBefore, 'createdBefore');
    const cursorFilter = buildCreatedAtCursorFilter<ActivityLogRecord>(
      trimSearch(req.query.cursor),
    );

    const filters: mongoose.FilterQuery<ActivityLogRecord>[] = [];

    if (actorUserId) {
      filters.push({ actorUserId: parseObjectId(actorUserId, 'actorUserId') });
    }

    if (resourceType) {
      filters.push({ resourceType });
    }

    if (resourceId) {
      filters.push({ resourceId });
    }

    if (action) {
      filters.push({ action });
    }

    if (parsed.result) {
      filters.push({ result: parsed.result });
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

    const query = filters.length > 0 ? { $and: filters } : {};
    const events = await ActivityLog.find(query)
      .select(
        'eventId actorUserId actorRole actorDepartmentId resourceType resourceId action result message metadata requestIp userAgent createdAt updatedAt',
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<ActivityLogRecord[]>();

    const { items, nextCursor } = buildPagedResult<ActivityLogRecord>(events, limit);

    return res.status(200).json({
      events: items.map(sanitizeActivityLog),
      nextCursor,
    });
  } catch (error) {
    return handleAdminActivityLogError(error, res, '[getAdminActivityLogs]');
  }
}
