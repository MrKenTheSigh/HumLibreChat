import mongoose, { type FilterQuery, type Types } from 'mongoose';

type StatusError = Error & { statusCode: number };

type CreatedAtCursor = {
  createdAt: string;
  id: string;
};

export const MAX_ADMIN_PAGE_SIZE = 100;
export const DEFAULT_ADMIN_PAGE_SIZE = 25;

export function createStatusError(statusCode: number, message: string): StatusError {
  return Object.assign(new Error(message), { statusCode });
}

export function parsePageSize(input: unknown): number {
  const parsed = Number(input ?? DEFAULT_ADMIN_PAGE_SIZE);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ADMIN_PAGE_SIZE) {
    throw createStatusError(
      400,
      `limit must be an integer between 1 and ${MAX_ADMIN_PAGE_SIZE}`,
    );
  }
  return parsed;
}

export function parseOptionalBoolean(input: unknown): boolean | undefined {
  if (input == null || input === '') {
    return undefined;
  }
  if (input === true || input === 'true') {
    return true;
  }
  if (input === false || input === 'false') {
    return false;
  }
  throw createStatusError(400, 'Boolean query parameters must be "true" or "false"');
}

export function parseOptionalDate(input: unknown, fieldName: string): Date | undefined {
  if (typeof input !== 'string' || input.trim() === '') {
    return undefined;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw createStatusError(400, `${fieldName} must be a valid ISO date string`);
  }

  return parsed;
}

export function parseObjectId(value: string, fieldName: string): Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createStatusError(400, `${fieldName} must be a valid ObjectId`);
  }
  return new mongoose.Types.ObjectId(value);
}

export function decodeCreatedAtCursor(cursor: string): CreatedAtCursor {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as CreatedAtCursor;
    if (
      typeof decoded?.createdAt !== 'string' ||
      decoded.createdAt.length === 0 ||
      typeof decoded?.id !== 'string' ||
      decoded.id.length === 0
    ) {
      throw new Error('Invalid cursor shape');
    }

    parseObjectId(decoded.id, 'cursor.id');
    parseOptionalDate(decoded.createdAt, 'cursor.createdAt');
    return decoded;
  } catch (_error) {
    throw createStatusError(400, 'Invalid cursor');
  }
}

export function encodeCreatedAtCursor(createdAt: Date | undefined, id: Types.ObjectId): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: (createdAt ?? new Date()).toISOString(),
      id: id.toString(),
    }),
  ).toString('base64');
}

export function buildCreatedAtCursorFilter<T extends { createdAt?: Date; _id: Types.ObjectId }>(
  cursor?: string,
): FilterQuery<T> | null {
  if (!cursor) {
    return null;
  }

  const decoded = decodeCreatedAtCursor(cursor);
  const createdAt = parseOptionalDate(decoded.createdAt, 'cursor.createdAt');
  if (!createdAt) {
    throw createStatusError(400, 'Invalid cursor');
  }

  return {
    $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: parseObjectId(decoded.id, 'cursor.id') } }],
  };
}

export function buildPagedResult<T extends { _id: Types.ObjectId; createdAt?: Date }>(
  items: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (items.length <= limit) {
    return {
      items,
      nextCursor: null,
    };
  }

  const trimmed = items.slice(0, limit);
  const lastItem = trimmed[trimmed.length - 1];
  return {
    items: trimmed,
    nextCursor: encodeCreatedAtCursor(lastItem.createdAt, lastItem._id),
  };
}

export function trimSearch(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

