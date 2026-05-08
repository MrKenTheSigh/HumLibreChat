import mongoose from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const mockConversationFind = jest.fn();
const mockConversationFindOne = jest.fn();
const mockMessageFind = jest.fn();
const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockUserFindOne = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Conversation: {
      find: mockConversationFind,
      findOne: mockConversationFindOne,
    },
    Message: {
      find: mockMessageFind,
    },
    User: {
      find: mockUserFind,
      findById: mockUserFindById,
      findOne: mockUserFindOne,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const { getAdminConversation, getAdminConversationMessages, getAdminConversations } =
  require('./conversations');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

function createLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin conversations handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdminConversations', () => {
    it('returns filtered conversation results with user email enrichment', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockConversationFind.mockReturnValue(
        createLeanQuery([
          {
            _id: new mongoose.Types.ObjectId(),
            conversationId: 'convo-1',
            user: userId.toString(),
            title: 'Azure setup',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
            createdAt: new Date('2026-03-25T00:00:00.000Z'),
            updatedAt: new Date('2026-03-25T01:00:00.000Z'),
          },
        ]),
      );
      mockUserFind.mockReturnValue(
        createLeanQuery([
          {
            _id: userId,
            email: 'user@example.com',
          },
        ]),
      );

      const req = {
        user: { role: SystemRoles.ADMIN },
        query: {
          search: 'azure',
          endpoint: 'azureOpenAI',
          model: 'gpt-4o',
          userId: userId.toString(),
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminConversations(req, res);

      expect(mockConversationFind).toHaveBeenCalledTimes(1);
      const query = mockConversationFind.mock.calls[0][0];
      expect(query.$and).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user: expect.any(mongoose.Types.ObjectId) }),
          expect.objectContaining({ endpoint: 'azureOpenAI' }),
          expect.objectContaining({ model: 'gpt-4o' }),
          expect.objectContaining({
            $or: expect.arrayContaining([expect.objectContaining({ title: expect.any(RegExp) })]),
          }),
        ]),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        conversations: [
          {
            conversationId: 'convo-1',
            userId: userId.toString(),
            userEmail: 'user@example.com',
            title: 'Azure setup',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
            createdAt: '2026-03-25T00:00:00.000Z',
            updatedAt: '2026-03-25T01:00:00.000Z',
          },
        ],
        nextCursor: null,
      });
    });

    it('limits manager conversation lists to users in the manager department', async () => {
      const managerId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      const memberId = new mongoose.Types.ObjectId();

      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: managerId,
          departmentId,
        }),
      );
      mockUserFind
        .mockReturnValueOnce(createSelectLeanQuery([{ _id: memberId }]))
        .mockReturnValueOnce(
          createLeanQuery([
            {
              _id: memberId,
              email: 'member@example.com',
            },
          ]),
        );
      mockConversationFind.mockReturnValue(
        createLeanQuery([
          {
            _id: new mongoose.Types.ObjectId(),
            conversationId: 'dept-convo',
            user: memberId.toString(),
            title: 'Department chat',
            createdAt: new Date('2026-03-25T00:00:00.000Z'),
          },
        ]),
      );

      const req = {
        user: { id: managerId.toString(), role: SystemRoles.MANAGER },
        query: {},
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminConversations(req, res);

      const query = mockConversationFind.mock.calls[0][0];
      expect(query.$and).toEqual(
        expect.arrayContaining([
          {
            user: {
              $in: [memberId],
            },
          },
        ]),
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getAdminConversation', () => {
    it('returns 404 when the conversation does not exist', async () => {
      mockConversationFindOne.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        user: { role: SystemRoles.ADMIN },
        params: {
          conversationId: 'missing-convo',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Conversation not found' });
    });
  });

  describe('getAdminConversationMessages', () => {
    it('returns 404 when a manager opens a conversation outside their department', async () => {
      const managerId = new mongoose.Types.ObjectId();
      const departmentId = new mongoose.Types.ObjectId();
      const outsideUserId = new mongoose.Types.ObjectId();

      mockUserFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: managerId,
          departmentId,
        }),
      );
      mockConversationFindOne.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
          conversationId: 'outside-convo',
          user: outsideUserId.toString(),
        }),
      );
      mockUserFindOne.mockReturnValue(createSelectLeanQuery(null));

      const req = {
        user: { id: managerId.toString(), role: SystemRoles.MANAGER },
        params: {
          conversationId: 'outside-convo',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminConversationMessages(req, res);

      expect(mockMessageFind).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Conversation not found' });
    });

    it('returns the full message stream for a conversation', async () => {
      const userId = new mongoose.Types.ObjectId();
      mockConversationFindOne.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
          conversationId: 'convo-2',
          user: userId.toString(),
          title: 'Review this chat',
          endpoint: 'azureOpenAI',
          model: 'gpt-4o-mini',
        }),
      );
      mockMessageFind.mockReturnValue(
        createLeanQuery([
          {
            _id: new mongoose.Types.ObjectId(),
            messageId: 'msg-1',
            parentMessageId: null,
            isCreatedByUser: true,
            sender: 'User',
            text: 'Hello',
            content: [],
            createdAt: new Date('2026-03-25T02:00:00.000Z'),
            updatedAt: new Date('2026-03-25T02:00:00.000Z'),
          },
          {
            _id: new mongoose.Types.ObjectId(),
            messageId: 'msg-2',
            parentMessageId: 'msg-1',
            isCreatedByUser: false,
            sender: 'Assistant',
            text: 'Hi there',
            content: [],
            createdAt: new Date('2026-03-25T02:01:00.000Z'),
            updatedAt: new Date('2026-03-25T02:01:00.000Z'),
          },
        ]),
      );
      mockUserFind.mockReturnValue(
        createSelectLeanQuery([
          {
            _id: userId,
            email: 'audited@example.com',
          },
        ]),
      );

      const req = {
        user: { role: SystemRoles.ADMIN },
        params: {
          conversationId: 'convo-2',
        },
      } as unknown as Request;
      const res = createMockResponse();

      await getAdminConversationMessages(req, res);

      expect(mockMessageFind).toHaveBeenCalledWith({ conversationId: 'convo-2' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        conversation: {
          conversationId: 'convo-2',
          userId: userId.toString(),
          userEmail: 'audited@example.com',
          title: 'Review this chat',
          endpoint: 'azureOpenAI',
          model: 'gpt-4o-mini',
          createdAt: null,
          updatedAt: null,
        },
        messages: [
          {
            messageId: 'msg-1',
            parentMessageId: null,
            isCreatedByUser: true,
            sender: 'User',
            text: 'Hello',
            content: [],
            createdAt: '2026-03-25T02:00:00.000Z',
            updatedAt: '2026-03-25T02:00:00.000Z',
          },
          {
            messageId: 'msg-2',
            parentMessageId: 'msg-1',
            isCreatedByUser: false,
            sender: 'Assistant',
            text: 'Hi there',
            content: [],
            createdAt: '2026-03-25T02:01:00.000Z',
            updatedAt: '2026-03-25T02:01:00.000Z',
          },
        ],
      });
    });
  });
});
