import mongoose from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const mockTransactionFind = jest.fn();
const mockTransactionAggregate = jest.fn();
const mockTransactionCountDocuments = jest.fn();
const mockDepartmentFind = jest.fn();
const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Transaction: {
      find: mockTransactionFind,
      aggregate: mockTransactionAggregate,
      countDocuments: mockTransactionCountDocuments,
    },
    Department: {
      find: mockDepartmentFind,
    },
    User: {
      find: mockUserFind,
      findById: mockUserFindById,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const { getAdminTransactions } = require('./usage');
const { getAdminUsageMembers } = require('./usage');
const { getAdminUsageSummary } = require('./usage');
const { exportAdminTransactionsCsv } = require('./usage');
const { exportAdminUsageMembersCsv } = require('./usage');
const { getAdminTransactionsExportCount } = require('./usage');
const { getAdminUsageMembersExportCount } = require('./usage');
const originalAdminUsageExportLimit = process.env.ADMIN_USAGE_EXPORT_LIMIT;

type MockResponse = Response & {
  send: jest.Mock;
  setHeader: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const send = jest.fn();
  const response = {
    json,
    send,
    setHeader: jest.fn(),
    status: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as MockResponse;
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
    mockDepartmentFind.mockReturnValue(createUserQuery([]));
    delete process.env.ADMIN_USAGE_EXPORT_LIMIT;
  });

  afterAll(() => {
    if (originalAdminUsageExportLimit == null) {
      delete process.env.ADMIN_USAGE_EXPORT_LIMIT;
      return;
    }

    process.env.ADMIN_USAGE_EXPORT_LIMIT = originalAdminUsageExportLimit;
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
      user: { role: SystemRoles.ADMIN },
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

  it('filters transactions by department members for full-access roles', async () => {
    const departmentId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    mockUserFind
      .mockReturnValueOnce(createUserQuery([{ _id: memberId }]))
      .mockReturnValueOnce(
        createUserQuery([
          {
            _id: memberId,
            email: 'member@example.com',
            name: 'Scoped Member',
          },
        ]),
      );
    mockTransactionFind.mockReturnValue(
      createLeanQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          user: memberId,
          tokenType: 'credits',
          createdAt: new Date('2026-03-26T12:00:00.000Z'),
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        departmentId: departmentId.toString(),
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactions(req, res);

    expect(mockUserFind).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ departmentId: { $in: [departmentId] } }),
    );
    expect(mockTransactionFind.mock.calls[0][0].$and).toEqual(
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

  it('returns 400 for invalid tokenType filters', async () => {
    const req = {
      user: { role: SystemRoles.ADMIN },
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
      user: { role: SystemRoles.ADMIN },
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
      user: { role: SystemRoles.ADMIN },
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

  it('returns member usage ranked by total tokens', async () => {
    const userId = new mongoose.Types.ObjectId();

    mockTransactionAggregate.mockResolvedValue([
      {
        _id: userId,
        transactionCount: 4,
        totalTokenValue: -1200,
        totalRawAmount: -400,
        totalInputTokens: 900,
        totalWriteTokens: 200,
        totalReadTokens: 100,
        totalTokens: 1200,
        newestTransactionAt: new Date('2026-03-28T12:00:00.000Z'),
      },
    ]);
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: userId,
          email: 'ranked@example.com',
          name: 'Ranked User',
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        model: 'gpt-4o',
        limit: '10',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageMembers(req, res);

    expect(mockTransactionAggregate).toHaveBeenCalledTimes(1);
    expect(mockTransactionAggregate.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        { $match: { $and: [{ model: 'gpt-4o' }] } },
        expect.objectContaining({ $group: expect.any(Object) }),
        expect.objectContaining({ $addFields: expect.any(Object) }),
        { $sort: { totalTokens: -1, transactionCount: -1, _id: 1 } },
        { $limit: 11 },
      ]),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      members: [
        {
          userId: userId.toString(),
          userEmail: 'ranked@example.com',
          userName: 'Ranked User',
          transactionCount: 4,
          totalTokenValue: -1200,
          totalRawAmount: -400,
          totalInputTokens: 900,
          totalWriteTokens: 200,
          totalReadTokens: 100,
          totalTokens: 1200,
          newestTransactionAt: '2026-03-28T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('returns a cursor when member usage has another page', async () => {
    const firstUserId = new mongoose.Types.ObjectId();
    const secondUserId = new mongoose.Types.ObjectId();

    mockTransactionAggregate.mockResolvedValue([
      {
        _id: firstUserId,
        transactionCount: 4,
        totalTokenValue: -1200,
        totalRawAmount: -400,
        totalInputTokens: 900,
        totalWriteTokens: 200,
        totalReadTokens: 100,
        totalTokens: 1200,
        newestTransactionAt: new Date('2026-03-28T12:00:00.000Z'),
      },
      {
        _id: secondUserId,
        transactionCount: 2,
        totalTokenValue: -800,
        totalRawAmount: -200,
        totalInputTokens: 700,
        totalWriteTokens: 50,
        totalReadTokens: 50,
        totalTokens: 800,
        newestTransactionAt: new Date('2026-03-27T12:00:00.000Z'),
      },
    ]);
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: firstUserId,
          email: 'first@example.com',
          name: 'First User',
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        limit: '1',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageMembers(req, res);

    const response = res.json.mock.calls[0][0];

    expect(response.members).toHaveLength(1);
    expect(response.members[0].userId).toBe(firstUserId.toString());
    expect(response.nextCursor).toEqual(expect.any(String));
    expect(mockUserFind).toHaveBeenCalledWith({
      _id: { $in: [firstUserId] },
    });
  });

  it('applies member usage cursors after aggregation sorting fields are available', async () => {
    const cursorUserId = new mongoose.Types.ObjectId();
    const cursor = Buffer.from(
      JSON.stringify({
        totalTokens: 1200,
        transactionCount: 4,
        userId: cursorUserId.toString(),
      }),
    ).toString('base64');

    mockTransactionAggregate.mockResolvedValue([]);
    mockUserFind.mockReturnValue(createUserQuery([]));

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        cursor,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageMembers(req, res);

    expect(mockTransactionAggregate.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ $addFields: expect.any(Object) }),
        {
          $match: {
            $or: [
              { totalTokens: { $lt: 1200 } },
              {
                totalTokens: 1200,
                transactionCount: { $lt: 4 },
              },
              {
                totalTokens: 1200,
                transactionCount: 4,
                _id: { $gt: cursorUserId },
              },
            ],
          },
        },
      ]),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('exports filtered transactions as csv without applying a page cursor', async () => {
    const transactionId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    mockTransactionFind.mockReturnValue(
      createLeanQuery([
        {
          _id: transactionId,
          user: userId,
          conversationId: 'convo,1',
          tokenType: 'prompt',
          model: 'gpt-4o',
          context: 'chat',
          rawAmount: -100,
          tokenValue: -250,
          rate: 2.5,
          inputTokens: 100,
          writeTokens: 20,
          readTokens: 10,
          createdAt: new Date('2026-03-26T12:00:00.000Z'),
        },
      ]),
    );
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: userId,
          email: 'export@example.com',
          name: 'Export User',
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        cursor: '2026-03-01T00:00:00.000Z',
        model: 'gpt-4o',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await exportAdminTransactionsCsv(req, res);

    expect(mockTransactionFind.mock.calls[0][0]).toEqual({ $and: [{ model: 'gpt-4o' }] });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="admin-usage-transactions.csv"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Truncated', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Limit', '10000');
    expect(res.send.mock.calls[0][0]).toContain('"convo,1"');
    expect(res.send.mock.calls[0][0]).toContain('export@example.com');
  });

  it('uses ADMIN_USAGE_EXPORT_LIMIT for csv export truncation', async () => {
    const firstTransactionId = new mongoose.Types.ObjectId();
    const secondTransactionId = new mongoose.Types.ObjectId();
    const firstUserId = new mongoose.Types.ObjectId();
    const secondUserId = new mongoose.Types.ObjectId();
    process.env.ADMIN_USAGE_EXPORT_LIMIT = '1';

    mockTransactionFind.mockReturnValue(
      createLeanQuery([
        {
          _id: firstTransactionId,
          user: firstUserId,
          tokenType: 'prompt',
          model: 'gpt-4o',
          createdAt: new Date('2026-03-26T12:00:00.000Z'),
        },
        {
          _id: secondTransactionId,
          user: secondUserId,
          tokenType: 'completion',
          model: 'gpt-4o',
          createdAt: new Date('2026-03-25T12:00:00.000Z'),
        },
      ]),
    );
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: firstUserId,
          email: 'first-export@example.com',
          name: 'First Export',
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {},
    } as unknown as Request;
    const res = createMockResponse();

    await exportAdminTransactionsCsv(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Truncated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Limit', '1');
    expect(res.send.mock.calls[0][0]).toContain('first-export@example.com');
    expect(res.send.mock.calls[0][0]).not.toContain(secondTransactionId.toString());
  });

  it('returns transaction export count with the configured limit', async () => {
    process.env.ADMIN_USAGE_EXPORT_LIMIT = '19';
    mockTransactionCountDocuments.mockResolvedValue(20);

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        model: 'gpt-4o',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactionsExportCount(req, res);

    expect(mockTransactionCountDocuments).toHaveBeenCalledWith({ $and: [{ model: 'gpt-4o' }] });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      count: 20,
      limit: 19,
    });
  });

  it('exports filtered member usage as csv', async () => {
    const userId = new mongoose.Types.ObjectId();

    mockTransactionAggregate.mockResolvedValue([
      {
        _id: userId,
        transactionCount: 4,
        totalTokenValue: -1200,
        totalRawAmount: -400,
        totalInputTokens: 900,
        totalWriteTokens: 200,
        totalReadTokens: 100,
        totalTokens: 1200,
        newestTransactionAt: new Date('2026-03-28T12:00:00.000Z'),
      },
    ]);
    mockUserFind.mockReturnValue(
      createUserQuery([
        {
          _id: userId,
          email: 'member-export@example.com',
          name: 'Member Export',
        },
      ]),
    );

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        model: 'gpt-4o',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await exportAdminUsageMembersCsv(req, res);

    expect(mockTransactionAggregate.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        { $match: { $and: [{ model: 'gpt-4o' }] } },
        { $limit: 10001 },
      ]),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="admin-usage-members.csv"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Truncated', 'false');
    expect(res.send.mock.calls[0][0]).toContain('member-export@example.com');
    expect(res.send.mock.calls[0][0]).toContain('1200');
  });

  it('returns member export count with the configured limit', async () => {
    process.env.ADMIN_USAGE_EXPORT_LIMIT = '19';
    mockTransactionAggregate.mockResolvedValue([{ count: 20 }]);

    const req = {
      user: { role: SystemRoles.ADMIN },
      query: {
        model: 'gpt-4o',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminUsageMembersExportCount(req, res);

    expect(mockTransactionAggregate).toHaveBeenCalledWith([
      { $match: { $and: [{ model: 'gpt-4o' }] } },
      { $group: { _id: '$user' } },
      { $count: 'count' },
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      count: 20,
      limit: 19,
    });
  });

  it('limits manager transaction queries to users in the manager department', async () => {
    const managerId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();

    mockUserFindById.mockReturnValue(
      createUserQuery({
        _id: managerId,
        departmentId,
      }),
    );
    mockUserFind
      .mockReturnValueOnce(createUserQuery([{ _id: memberId }]))
      .mockReturnValueOnce(
        createUserQuery([
          {
            _id: memberId,
            email: 'member@example.com',
            name: 'Member',
          },
        ]),
      );
    mockTransactionFind.mockReturnValue(
      createLeanQuery([
        {
          _id: new mongoose.Types.ObjectId(),
          user: memberId,
          tokenType: 'prompt',
          createdAt: new Date('2026-03-26T12:00:00.000Z'),
        },
      ]),
    );

    const req = {
      user: { id: managerId.toString(), role: SystemRoles.MANAGER },
      query: {},
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactions(req, res);

    expect(mockTransactionFind.mock.calls[0][0].$and).toEqual(
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

  it('rejects manager department filters outside the manager scope', async () => {
    const managerId = new mongoose.Types.ObjectId();
    const managerDepartmentId = new mongoose.Types.ObjectId();
    const otherDepartmentId = new mongoose.Types.ObjectId();

    mockUserFindById.mockReturnValue(
      createUserQuery({
        _id: managerId,
        departmentId: managerDepartmentId,
      }),
    );

    const req = {
      user: { id: managerId.toString(), role: SystemRoles.MANAGER },
      query: {
        departmentId: otherDepartmentId.toString(),
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminTransactions(req, res);

    expect(mockTransactionFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'departmentId is outside the allowed scope',
    });
  });
});
