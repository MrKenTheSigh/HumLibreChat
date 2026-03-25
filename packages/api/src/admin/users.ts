import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, createMethods, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { IUser, IBalance } from '@librechat/data-schemas';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parseOptionalBoolean,
  parsePageSize,
  trimSearch,
} from './utils';

const { User, Balance, Transaction } = createModels(mongoose);
const { updateBalance } = createMethods(mongoose);

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

function sanitizeUserDetail(user: AdminUserDetailRecord, balance: IBalance | null) {
  const base = sanitizeUserListItem(user);
  return {
    ...base,
    termsAccepted: user.termsAccepted ?? false,
    favoritesCount: user.favorites?.length ?? 0,
    plugins: user.plugins ?? [],
    personalization: {
      memories: user.personalization?.memories ?? true,
    },
    balance: {
      tokenCredits: balance?.tokenCredits ?? 0,
      updatedAt: null,
    },
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

    const { items, nextCursor } = buildPagedResult(users, limit);

    return res.status(200).json({
      users: items.map(sanitizeUserListItem),
      nextCursor,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminUsers]');
  }
}

export async function getAdminUser(req: Request, res: Response) {
  try {
    const userId = parseObjectId(req.params.userId, 'userId');
    const user = await User.findById(userId)
      .select(
        '_id name username email role provider emailVerified twoFactorEnabled termsAccepted personalization plugins favorites createdAt updatedAt',
      )
      .lean<AdminUserDetailRecord | null>();

    if (!user) {
      throw createStatusError(404, 'User not found');
    }

    const balance = (await Balance.findOne({ user: userId }).lean()) as IBalance | null;
    return res.status(200).json(sanitizeUserDetail(user, balance));
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
