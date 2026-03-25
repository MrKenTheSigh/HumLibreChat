import mongoose from 'mongoose';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { IUser } from '@librechat/data-schemas';
import {
  buildCreatedAtCursorFilter,
  buildPagedResult,
  createStatusError,
  parseObjectId,
  parseOptionalDate,
  parsePageSize,
  trimSearch,
} from './utils';

const { Conversation, Message, User } = createModels(mongoose);

type AdminConversationListItem = {
  _id: mongoose.Types.ObjectId;
  conversationId: string;
  user?: string | mongoose.Types.ObjectId;
  title?: string;
  endpoint?: string;
  model?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminMessageItem = {
  _id: mongoose.Types.ObjectId;
  messageId: string;
  parentMessageId?: string;
  isCreatedByUser: boolean;
  sender?: string;
  text?: string;
  content?: unknown[];
  createdAt?: Date;
  updatedAt?: Date;
};

type AdminUserIdRecord = {
  _id: mongoose.Types.ObjectId;
};

type AdminUserEmailRecord = {
  _id: mongoose.Types.ObjectId;
  email: string;
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

async function loadUserEmailMap(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const users = await User.find({
    _id: { $in: userIds.map((userId) => parseObjectId(userId, 'userId')) },
  })
    .select('_id email')
    .lean<AdminUserEmailRecord[]>();

  return new Map(users.map((user) => [user._id.toString(), user.email]));
}

function sanitizeConversation(
  conversation: AdminConversationListItem,
  userEmailMap: Map<string, string>,
) {
  const userId = conversation.user != null ? String(conversation.user) : '';
  return {
    conversationId: conversation.conversationId,
    userId,
    userEmail: userEmailMap.get(userId) ?? null,
    title: conversation.title ?? null,
    endpoint: conversation.endpoint ?? null,
    model: conversation.model ?? null,
    createdAt: conversation.createdAt?.toISOString() ?? null,
    updatedAt: conversation.updatedAt?.toISOString() ?? null,
  };
}

function sanitizeMessage(message: AdminMessageItem) {
  return {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId ?? null,
    isCreatedByUser: message.isCreatedByUser,
    sender: message.sender ?? null,
    text: message.text ?? null,
    content: message.content ?? [],
    createdAt: message.createdAt?.toISOString() ?? null,
    updatedAt: message.updatedAt?.toISOString() ?? null,
  };
}

export async function getAdminConversations(req: Request, res: Response) {
  try {
    const limit = parsePageSize(req.query.limit);
    const search = trimSearch(req.query.search);
    const userId = trimSearch(req.query.userId);
    const endpoint = trimSearch(req.query.endpoint);
    const model = trimSearch(req.query.model);
    const createdAfter = parseOptionalDate(req.query.createdAfter, 'createdAfter');
    const createdBefore = parseOptionalDate(req.query.createdBefore, 'createdBefore');
    const cursorFilter = buildCreatedAtCursorFilter<AdminConversationListItem>(
      trimSearch(req.query.cursor),
    );

    const filters: mongoose.FilterQuery<AdminConversationListItem>[] = [];

    if (userId) {
      filters.push({ user: parseObjectId(userId, 'userId') });
    }

    if (endpoint && endpoint.toLowerCase() !== 'all') {
      filters.push({ endpoint });
    }

    if (model && model.toLowerCase() !== 'all') {
      filters.push({ model });
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

    if (search) {
      const regex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ email: regex }, { name: regex }, { username: regex }],
      })
        .select('_id')
        .limit(200)
        .lean<AdminUserIdRecord[]>();

      const matchingUserIds = matchingUsers.map((user) => user._id);
      filters.push({
        $or: [
          { title: regex },
          ...(matchingUserIds.length > 0 ? [{ user: { $in: matchingUserIds } }] : []),
        ],
      });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const query = filters.length > 0 ? { $and: filters } : {};
    const conversations = await Conversation.find(query)
      .select('conversationId user title endpoint model createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<AdminConversationListItem[]>();

    const { items, nextCursor } = buildPagedResult(conversations, limit);
    const userEmailMap = await loadUserEmailMap(
      Array.from(new Set(items.map((conversation) => String(conversation.user ?? '')))).filter(
        Boolean,
      ),
    );

    return res.status(200).json({
      conversations: items.map((conversation) => sanitizeConversation(conversation, userEmailMap)),
      nextCursor,
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminConversations]');
  }
}

export async function getAdminConversation(req: Request, res: Response) {
  try {
    const conversationId = req.params.conversationId;
    const conversation = await Conversation.findOne({ conversationId })
      .select('conversationId user title endpoint model createdAt updatedAt')
      .lean<AdminConversationListItem | null>();

    if (!conversation) {
      throw createStatusError(404, 'Conversation not found');
    }

    const userId = conversation.user != null ? String(conversation.user) : '';
    const userEmailMap = await loadUserEmailMap(userId ? [userId] : []);

    return res.status(200).json(sanitizeConversation(conversation, userEmailMap));
  } catch (error) {
    return handleAdminError(error, res, '[getAdminConversation]');
  }
}

export async function getAdminConversationMessages(req: Request, res: Response) {
  try {
    const conversationId = req.params.conversationId;
    const conversation = await Conversation.findOne({ conversationId })
      .select('conversationId user title endpoint model createdAt updatedAt')
      .lean<AdminConversationListItem | null>();

    if (!conversation) {
      throw createStatusError(404, 'Conversation not found');
    }

    const messages = await Message.find({ conversationId })
      .select('messageId parentMessageId isCreatedByUser sender text content createdAt updatedAt')
      .sort({ createdAt: 1, _id: 1 })
      .lean<AdminMessageItem[]>();

    const userId = conversation.user != null ? String(conversation.user) : '';
    const userEmailMap = await loadUserEmailMap(userId ? [userId] : []);

    return res.status(200).json({
      conversation: sanitizeConversation(conversation, userEmailMap),
      messages: messages.map(sanitizeMessage),
    });
  } catch (error) {
    return handleAdminError(error, res, '[getAdminConversationMessages]');
  }
}
