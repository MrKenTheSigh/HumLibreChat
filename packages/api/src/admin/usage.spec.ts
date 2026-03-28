import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockTransactionFind = jest.fn();
const mockTransactionAggregate = jest.fn();
const mockUserFind = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Transaction: {
      find: mockTransactionFind,
      aggregate: mockTransactionAggregate,
    },
    User: {
      find: mockUserFind,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const { getAdminTransactions } = require('./usage');
const { getAdminUsageSummary } = require('./usage');

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

function createUserQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin usage handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a paginated transaction list with user details', async () => {
    const transactionId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    mockTransactionFind.mockReturnValue(
      createLeanQuery([
        {
          _id: transactionId,
          user: userId,
          conversationId: 'convo-1',
          tokenType: 'prompt',
          model: 'gpt-4o',
          context: 'message',
          rawAmount: -100,
          tokenValue: -250,
          rate: 2.5,
          rateDetail: { input: 2.5, write: 1.25, read: 0.25 },
          inputTokens: 100,
          writeTokens: 0,
          readTokens: 0,
          createdAt: new Date('2026-03-26T12:00:00.000Z'),
        },
      ]),
    );
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: userId,
          email: 'user@example.com',
          name: 'Usage User',
        },
      ]),
    );

    const req = {
      query: {
        userId: userId.toString(),
        model: 'gpt-4o',
        context: 'message',
        tokenType: 'prompt',
        dateFrom: '2026-03-01T00:00:00.000Z',
        dateTo: '2026-03-31T23:59:59.999Z',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactions(req, res);

    expect(mockTransactionFind).toHaveBeenCalledTimes(1);
    expect(mockTransactionFind.mock.calls[0][0].$and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user: expect.any(mongoose.Types.ObjectId) }),
        expect.objectContaining({ model: 'gpt-4o' }),
        expect.objectContaining({ context: 'message' }),
        expect.objectContaining({ tokenType: 'prompt' }),
        expect.objectContaining({ createdAt: expect.any(Object) }),
      ]),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      transactions: [
        {
          id: transactionId.toString(),
          userId: userId.toString(),
          userEmail: 'user@example.com',
          userName: 'Usage User',
          conversationId: 'convo-1',
          tokenType: 'prompt',
          model: 'gpt-4o',
          context: 'message',
          rawAmount: -100,
          tokenValue: -250,
          rate: 2.5,
          rateDetail: { input: 2.5, write: 1.25, read: 0.25 },
          inputTokens: 100,
          writeTokens: 0,
          readTokens: 0,
          createdAt: '2026-03-26T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('returns 400 for invalid tokenType filters', async () => {
    const req = {
      query: {
        tokenType: 'invalid',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'tokenType must be one of prompt, completion, or credits',
    });
  });

  it('returns an aggregated usage summary for the current filters', async () => {
    const userId = new mongoose.Types.ObjectId();

    mockTransactionAggregate.mockResolvedValue([
      {
        _id: null,
        transactionCount: 3,
        uniqueUsers: [userId],
        totalTokenValue: -750,
        totalRawAmount: -300,
        totalInputTokens: 300,
        totalWriteTokens: 40,
        totalReadTokens: 10,
        newestTransactionAt: new Date('2026-03-26T12:00:00.000Z'),
        oldestTransactionAt: new Date('2026-03-20T08:00:00.000Z'),
      },
    ]);

    const req = {
      query: {
        userId: userId.toString(),
        model: 'gpt-4o',
        context: 'message',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageSummary(req, res);

    expect(mockTransactionAggregate).toHaveBeenCalledTimes(1);
    expect(mockTransactionAggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        $and: [
          { user: expect.any(mongoose.Types.ObjectId) },
          { model: 'gpt-4o' },
          { context: 'message' },
        ],
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      transactionCount: 3,
      uniqueUsers: 1,
      totalTokenValue: -750,
      totalRawAmount: -300,
      totalInputTokens: 300,
      totalWriteTokens: 40,
      totalReadTokens: 10,
      newestTransactionAt: '2026-03-26T12:00:00.000Z',
      oldestTransactionAt: '2026-03-20T08:00:00.000Z',
    });
  });

  it('returns an empty usage summary when no transactions match', async () => {
    mockTransactionAggregate.mockResolvedValue([]);

    const req = {
      query: {},
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageSummary(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      transactionCount: 0,
      uniqueUsers: 0,
      totalTokenValue: 0,
      totalRawAmount: 0,
      totalInputTokens: 0,
      totalWriteTokens: 0,
      totalReadTokens: 0,
      newestTransactionAt: null,
      oldestTransactionAt: null,
    });
  });
});
