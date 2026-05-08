import crypto from 'crypto';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockDepartmentFindById = jest.fn();
const mockManagerReviewBatchCreate = jest.fn();
const mockManagerReviewBatchCountDocuments = jest.fn();
const mockManagerReviewBatchFind = jest.fn();
const mockManagerReviewBatchFindById = jest.fn();
const mockManagerReviewBatchFindByIdAndUpdate = jest.fn();
const mockManagerReviewBatchFindOne = jest.fn();
const mockManagerReviewBatchUpdateMany = jest.fn();
const mockManagerReviewItemFind = jest.fn();
const mockManagerReviewItemInsertMany = jest.fn();
const mockManagerReviewItemUpdateMany = jest.fn();
const mockQuotaAccountFind = jest.fn();
const mockQuotaAccountFindOne = jest.fn();
const mockQuotaLedgerEntryAggregate = jest.fn();
const mockQuotaPeriodFindOne = jest.fn();
const mockTransactionAggregate = jest.fn();
const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockActivityLogCreate = jest.fn();
const mockLoggerError = jest.fn();
const mockSendManagerReviewEmail = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    ActivityLog: {
      create: mockActivityLogCreate,
    },
    Department: {
      findById: mockDepartmentFindById,
    },
    ManagerReviewBatch: {
      create: mockManagerReviewBatchCreate,
      countDocuments: mockManagerReviewBatchCountDocuments,
      find: mockManagerReviewBatchFind,
      findById: mockManagerReviewBatchFindById,
      findByIdAndUpdate: mockManagerReviewBatchFindByIdAndUpdate,
      findOne: mockManagerReviewBatchFindOne,
      updateMany: mockManagerReviewBatchUpdateMany,
    },
    ManagerReviewItem: {
      find: mockManagerReviewItemFind,
      insertMany: mockManagerReviewItemInsertMany,
      updateMany: mockManagerReviewItemUpdateMany,
    },
    QuotaAccount: {
      find: mockQuotaAccountFind,
      findOne: mockQuotaAccountFindOne,
    },
    QuotaLedgerEntry: {
      aggregate: mockQuotaLedgerEntryAggregate,
    },
    QuotaPeriod: {
      findOne: mockQuotaPeriodFindOne,
    },
    Transaction: {
      aggregate: mockTransactionAggregate,
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

jest.mock('./managerReviewEmailSender', () => ({
  sendManagerReviewEmail: (...args: unknown[]) => mockSendManagerReviewEmail(...args),
}));

const {
  createManagerReviewBatch,
  getManagerReviewBatchItems,
  getManagerReviewBatches,
  getManagerReviewBatchByToken,
  getManagerReviewBatchItemsByToken,
  previewManagerReviewBatchEmail,
  scanOverdueManagerReviewBatches,
  sendManagerReviewBatchEmail,
  sendManagerReviewBatchReminderEmail,
  submitManagerReviewBatchResponseByToken,
  submitManagerReviewBatchResponse,
} = require('./managerReviews');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createListQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('admin manager review handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuotaPeriodFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaAccountFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaAccountFind.mockReturnValue(createSelectLeanQuery([]));
    mockQuotaLedgerEntryAggregate.mockResolvedValue([]);
  });

  it('creates a manager review batch from department usage', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const quotaPeriodId = new mongoose.Types.ObjectId();
    const departmentQuotaAccountId = new mongoose.Types.ObjectId();
    const userQuotaAccountId = new mongoose.Types.ObjectId();
    const periodStart = '2026-04-20T00:00:00.000Z';
    const periodEnd = '2026-04-21T00:00:00.000Z';

    mockUserFindById.mockReturnValue(
      createSelectLeanQuery({ _id: managerUserId, email: 'manager@example.com' }),
    );
    mockDepartmentFindById.mockReturnValue(
      createSelectLeanQuery({ _id: departmentId, managerUserId }),
    );
    mockManagerReviewBatchFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockUserFind.mockReturnValue(createSelectLeanQuery([{ _id: userId }]));
    mockTransactionAggregate.mockResolvedValue([
      {
        _id: { user: userId, conversationId: 'conversation-1' },
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        newestTransactionAt: new Date('2026-04-20T12:00:00.000Z'),
      },
    ]);
    mockQuotaPeriodFindOne.mockReturnValue(createSelectLeanQuery({ _id: quotaPeriodId }));
    mockQuotaAccountFindOne.mockReturnValue(
      createSelectLeanQuery({
        _id: departmentQuotaAccountId,
        periodId: quotaPeriodId,
        scopeType: 'department',
        scopeId: departmentId.toString(),
        baseAllocatedCredits: 100,
        extraGrantedCredits: 20,
        usedCredits: 35,
        remainingCredits: 85,
        bufferCredits: 5,
      }),
    );
    mockQuotaAccountFind.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: userQuotaAccountId,
          periodId: quotaPeriodId,
          scopeType: 'user',
          scopeId: userId.toString(),
          baseAllocatedCredits: 50,
          extraGrantedCredits: 10,
          usedCredits: 12,
          remainingCredits: 48,
          bufferCredits: 0,
        },
      ]),
    );
    mockQuotaLedgerEntryAggregate.mockResolvedValue([
      {
        _id: { accountId: departmentQuotaAccountId, entryType: 'warning' },
        count: 1,
      },
      {
        _id: { accountId: userQuotaAccountId, entryType: 'block' },
        count: 2,
      },
    ]);
    mockManagerReviewBatchCreate.mockImplementation(async (input) => ({
      _id: batchId,
      createdAt: new Date('2026-04-21T00:00:00.000Z'),
      updatedAt: new Date('2026-04-21T00:00:00.000Z'),
      ...input,
    }));

    const req = {
      body: {
        managerUserId: managerUserId.toString(),
        departmentId: departmentId.toString(),
        cadence: 'daily',
        periodStart,
        periodEnd,
      },
    } as Request;
    const res = createMockResponse();

    await createManagerReviewBatch(req, res);

    expect(mockTransactionAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            user: { $in: [userId] },
          }),
        }),
        { $limit: 100 },
      ]),
    );
    expect(mockManagerReviewBatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        managerUserId,
        departmentId,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        emailTo: 'manager@example.com',
        quotaPeriodId,
        quotaAccountId: departmentQuotaAccountId,
        quotaAllocatedCredits: 100,
        quotaRemainingCredits: 85,
        quotaWarningCount: 1,
      }),
    );
    expect(mockManagerReviewItemInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        batchId,
        managerUserId,
        departmentId,
        userId,
        conversationId: 'conversation-1',
        transactionCount: 2,
        quotaAccountId: userQuotaAccountId,
        quotaRemainingCredits: 48,
        quotaBlockCount: 2,
      }),
    ]);
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'manager_review_batch',
        resourceId: batchId.toString(),
        action: 'manager_review_batch.create',
        result: 'success',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: expect.objectContaining({
          id: batchId.toString(),
          itemCount: 1,
          quotaRemainingCredits: 85,
          quotaWarningCount: 1,
        }),
        replyToken: expect.any(String),
      }),
    );
  });

  it('rejects duplicate manager review batches for the same period', async () => {
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockUserFindById.mockReturnValue(createSelectLeanQuery({ _id: managerUserId }));
    mockDepartmentFindById.mockReturnValue(
      createSelectLeanQuery({ _id: departmentId, managerUserId }),
    );
    mockManagerReviewBatchFindOne.mockReturnValue(
      createSelectLeanQuery({ _id: new mongoose.Types.ObjectId() }),
    );

    const req = {
      body: {
        managerUserId: managerUserId.toString(),
        departmentId: departmentId.toString(),
        periodStart: '2026-04-20T00:00:00.000Z',
        periodEnd: '2026-04-21T00:00:00.000Z',
      },
    } as Request;
    const res = createMockResponse();

    await createManagerReviewBatch(req, res);

    expect(mockManagerReviewBatchCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Manager review batch already exists for this period',
    });
  });

  it('returns paged manager review batches', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-04-21T00:00:00.000Z');

    mockManagerReviewBatchFind.mockReturnValue(
      createListQuery([
        {
          _id: batchId,
          batchKey: 'batch-key',
          managerUserId,
          departmentId,
          cadence: 'daily',
          periodStart: new Date('2026-04-20T00:00:00.000Z'),
          periodEnd: new Date('2026-04-21T00:00:00.000Z'),
          status: 'generated',
          itemCount: 1,
          transactionCount: 2,
          totalTokenValue: 10,
          totalRawAmount: 5,
          totalInputTokens: 6,
          totalWriteTokens: 3,
          totalReadTokens: 1,
          emailTo: 'manager@example.com',
          createdAt,
          updatedAt: createdAt,
        },
      ]),
    );

    const req = {
      query: {
        limit: '25',
        managerUserId: managerUserId.toString(),
        departmentId: departmentId.toString(),
        status: 'reviewed',
        cadence: 'weekly',
        responseStatus: 'ok',
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.999Z',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getManagerReviewBatches(req, res);

    expect(mockManagerReviewBatchFind).toHaveBeenCalledWith({
      $and: [
        { managerUserId },
        { departmentId },
        { status: 'reviewed' },
        { cadence: 'weekly' },
        { responseStatus: 'ok' },
        { periodEnd: { $gte: new Date('2026-04-01T00:00:00.000Z') } },
        { periodStart: { $lte: new Date('2026-04-30T23:59:59.999Z') } },
      ],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      batches: [
        expect.objectContaining({
          id: batchId.toString(),
          managerUserId: managerUserId.toString(),
          departmentId: departmentId.toString(),
          itemCount: 1,
        }),
      ],
      nextCursor: null,
    });
  });

  it('returns paged manager review batch items with user details', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const itemId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const createdAt = new Date('2026-04-21T00:00:00.000Z');

    mockManagerReviewBatchFindById.mockReturnValue(createSelectLeanQuery({ _id: batchId }));
    mockManagerReviewItemFind.mockReturnValue(
      createListQuery([
        {
          _id: itemId,
          batchId,
          managerUserId,
          departmentId,
          userId,
          conversationId: 'conversation-1',
          status: 'pending',
          riskLevel: 'normal',
          transactionCount: 2,
          totalTokenValue: 10,
          totalRawAmount: 5,
          totalInputTokens: 6,
          totalWriteTokens: 3,
          totalReadTokens: 1,
          newestTransactionAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        },
      ]),
    );
    mockUserFind.mockReturnValue(
      createSelectLeanQuery([
        {
          _id: userId,
          email: 'member@example.com',
          name: 'Member',
        },
      ]),
    );

    const req = {
      params: { batchId: batchId.toString() },
      query: { limit: '20' },
    } as unknown as Request;
    const res = createMockResponse();

    await getManagerReviewBatchItems(req, res);

    expect(mockManagerReviewBatchFindById).toHaveBeenCalledWith(batchId);
    expect(mockManagerReviewItemFind).toHaveBeenCalledWith({ batchId });
    expect(mockUserFind).toHaveBeenCalledWith({ _id: { $in: [userId] } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          id: itemId.toString(),
          userId: userId.toString(),
          userEmail: 'member@example.com',
          userName: 'Member',
          conversationId: 'conversation-1',
          totalTokenValue: 10,
        }),
      ],
      nextCursor: null,
    });
  });

  it('returns a manager review email preview without sending mail', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'generated',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await previewManagerReviewBatchEmail(req, res);

    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'manager_review_batch',
        resourceId: batchId.toString(),
        action: 'manager_review_batch.email.preview',
        result: 'success',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      mode: 'dry_run',
      sent: false,
      email: expect.objectContaining({
        to: 'manager@example.com',
        subject: expect.stringContaining('Manager review'),
      }),
      batch: expect.objectContaining({
        id: batchId.toString(),
      }),
    });
  });

  it('marks generated and sent manager review batches overdue', async () => {
    mockManagerReviewBatchUpdateMany.mockResolvedValue({
      matchedCount: 2,
      modifiedCount: 2,
    });
    mockManagerReviewBatchCountDocuments.mockResolvedValue(3);

    const req = {} as Request;
    const res = createMockResponse();

    await scanOverdueManagerReviewBatches(req, res);

    expect(mockManagerReviewBatchUpdateMany).toHaveBeenCalledWith(
      {
        status: { $in: ['generated', 'sent'] },
        dueAt: { $ne: null, $lt: expect.any(Date) },
      },
      {
        $set: {
          status: 'overdue',
        },
      },
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manager_review_batch.overdue.scan',
        result: 'success',
        metadata: expect.objectContaining({
          matchedCount: 2,
          modifiedCount: 2,
          overdueCount: 3,
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      matchedCount: 2,
      modifiedCount: 2,
      overdueCount: 3,
      scannedAt: expect.any(String),
    });
  });

  it('sends a manager review email and marks the batch as sent', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const sentAt = new Date('2026-04-21T00:00:00.000Z');

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'generated',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockSendManagerReviewEmail.mockResolvedValue({ mode: 'smtp', sent: true });
    mockManagerReviewBatchFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        sentAt,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await sendManagerReviewBatchEmail(req, res);

    expect(mockSendManagerReviewEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager@example.com',
        subject: expect.stringContaining('Manager review'),
      }),
    );
    expect(mockManagerReviewBatchFindByIdAndUpdate).toHaveBeenCalledWith(
      batchId,
      {
        $set: {
          status: 'sent',
          sentAt: expect.any(Date),
        },
      },
      { new: true },
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manager_review_batch.email.send',
        result: 'success',
        metadata: expect.objectContaining({
          mode: 'smtp',
          sent: true,
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'smtp',
        sent: true,
        batch: expect.objectContaining({
          id: batchId.toString(),
          status: 'sent',
        }),
      }),
    );
  });

  it('sends a manager review email with a token link when smtp mode is enabled', async () => {
    const previousMode = process.env.MANAGER_REVIEW_EMAIL_MODE;
    process.env.MANAGER_REVIEW_EMAIL_MODE = 'smtp';
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'generated',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockSendManagerReviewEmail.mockResolvedValue({ mode: 'smtp', sent: true });
    mockManagerReviewBatchFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    try {
      await sendManagerReviewBatchEmail(req, res);

      expect(mockSendManagerReviewEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(`/manager-review/${batchId.toString()}?token=`),
        }),
      );
      expect(mockManagerReviewBatchFindByIdAndUpdate).toHaveBeenCalledWith(
        batchId,
        {
          $set: expect.objectContaining({
            status: 'sent',
            replyTokenHash: expect.any(String),
          }),
        },
        { new: true },
      );
    } finally {
      if (previousMode) {
        process.env.MANAGER_REVIEW_EMAIL_MODE = previousMode;
      } else {
        delete process.env.MANAGER_REVIEW_EMAIL_MODE;
      }
    }
  });

  it('skips manager review email sending when email mode is disabled', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'generated',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockSendManagerReviewEmail.mockResolvedValue({
      mode: 'disabled',
      sent: false,
      reason: 'MANAGER_REVIEW_EMAIL_MODE is not smtp',
    });

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await sendManagerReviewBatchEmail(req, res);

    expect(mockManagerReviewBatchFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manager_review_batch.email.send',
        result: 'success',
        metadata: expect.objectContaining({
          mode: 'disabled',
          sent: false,
          reason: 'MANAGER_REVIEW_EMAIL_MODE is not smtp',
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'disabled',
        sent: false,
        reason: 'MANAGER_REVIEW_EMAIL_MODE is not smtp',
        batch: expect.objectContaining({
          id: batchId.toString(),
          status: 'generated',
        }),
      }),
    );
  });

  it('rejects manager review email sending when the batch is already reviewed', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'reviewed',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await sendManagerReviewBatchEmail(req, res);

    expect(mockSendManagerReviewEmail).not.toHaveBeenCalled();
    expect(mockManagerReviewBatchFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Manager review batch is already reviewed',
    });
  });

  it('sends a manager review reminder email for an overdue batch', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const reminderSentAt = new Date('2026-04-22T00:00:00.000Z');
    const previousMode = process.env.MANAGER_REVIEW_EMAIL_MODE;
    process.env.MANAGER_REVIEW_EMAIL_MODE = 'smtp';

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'overdue',
        dueAt: new Date('2026-04-21T12:00:00.000Z'),
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockSendManagerReviewEmail.mockResolvedValue({ mode: 'smtp', sent: true });
    mockManagerReviewBatchFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'overdue',
        dueAt: new Date('2026-04-21T12:00:00.000Z'),
        reminderSentAt,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    try {
      await sendManagerReviewBatchReminderEmail(req, res);

      expect(mockSendManagerReviewEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'manager@example.com',
          subject: expect.stringContaining('Reminder'),
          text: expect.stringContaining(`/manager-review/${batchId.toString()}?token=`),
        }),
      );
      expect(mockManagerReviewBatchFindByIdAndUpdate).toHaveBeenCalledWith(
        batchId,
        {
          $set: expect.objectContaining({
            reminderSentAt: expect.any(Date),
            replyTokenHash: expect.any(String),
          }),
        },
        { new: true },
      );
      expect(mockActivityLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'manager_review_batch.reminder.email.send',
          result: 'success',
          metadata: expect.objectContaining({
            mode: 'smtp',
            sent: true,
          }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sent: true,
          batch: expect.objectContaining({
            status: 'overdue',
            reminderSentAt: reminderSentAt.toISOString(),
          }),
        }),
      );
    } finally {
      if (previousMode) {
        process.env.MANAGER_REVIEW_EMAIL_MODE = previousMode;
      } else {
        delete process.env.MANAGER_REVIEW_EMAIL_MODE;
      }
    }
  });

  it('rejects reminder email sending when the batch is not overdue', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = { params: { batchId: batchId.toString() } } as unknown as Request;
    const res = createMockResponse();

    await sendManagerReviewBatchReminderEmail(req, res);

    expect(mockSendManagerReviewEmail).not.toHaveBeenCalled();
    expect(mockManagerReviewBatchFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Manager review batch is not overdue',
    });
  });

  it('submits a manager review response and marks pending items', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const reviewedAt = new Date('2026-04-21T00:00:00.000Z');

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockManagerReviewBatchFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'reviewed',
        responseStatus: 'ok',
        responseText: 'Looks fine',
        reviewedAt,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockManagerReviewItemUpdateMany.mockResolvedValue({ modifiedCount: 1 });

    const req = {
      params: { batchId: batchId.toString() },
      body: { responseStatus: 'ok', responseText: 'Looks fine' },
    } as unknown as Request;
    const res = createMockResponse();

    await submitManagerReviewBatchResponse(req, res);

    expect(mockManagerReviewBatchFindByIdAndUpdate).toHaveBeenCalledWith(
      batchId,
      {
        $set: {
          status: 'reviewed',
          responseStatus: 'ok',
          responseText: 'Looks fine',
          reviewedAt: expect.any(Date),
        },
      },
      { new: true },
    );
    expect(mockManagerReviewItemUpdateMany).toHaveBeenCalledWith(
      { batchId, status: 'pending' },
      {
        $set: {
          status: 'ok',
          responseText: 'Looks fine',
          reviewedAt: expect.any(Date),
        },
      },
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manager_review_batch.response.submit',
        result: 'success',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      batch: expect.objectContaining({
        id: batchId.toString(),
        status: 'reviewed',
        responseStatus: 'ok',
      }),
    });
  });

  it('rejects admin manager review response when the batch is already reviewed', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'reviewed',
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = {
      params: { batchId: batchId.toString() },
      body: { responseStatus: 'ok', responseText: 'Overwrite' },
    } as unknown as Request;
    const res = createMockResponse();

    await submitManagerReviewBatchResponse(req, res);

    expect(mockManagerReviewBatchFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockManagerReviewItemUpdateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Manager review batch is already reviewed',
    });
  });

  it('returns a manager review batch for a valid token', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const token = 'valid-review-token';
    const replyTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        replyTokenHash,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );

    const req = {
      params: { batchId: batchId.toString() },
      query: { token },
    } as unknown as Request;
    const res = createMockResponse();

    await getManagerReviewBatchByToken(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      batch: expect.objectContaining({
        id: batchId.toString(),
        status: 'sent',
      }),
    });
  });

  it('returns manager review batch items for a valid token', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const itemId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const token = 'valid-review-token';
    const replyTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        replyTokenHash,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockManagerReviewItemFind.mockReturnValue(
      createListQuery([
        {
          _id: itemId,
          batchId,
          managerUserId,
          departmentId,
          userId,
          conversationId: 'conversation-1',
          status: 'pending',
          riskLevel: 'normal',
          transactionCount: 2,
          totalTokenValue: 10,
          totalRawAmount: 5,
          totalInputTokens: 6,
          totalWriteTokens: 3,
          totalReadTokens: 1,
          createdAt: new Date('2026-04-21T00:00:00.000Z'),
        },
      ]),
    );
    mockUserFind.mockReturnValue(
      createSelectLeanQuery([{ _id: userId, email: 'member@example.com', name: 'Member' }]),
    );

    const req = {
      params: { batchId: batchId.toString() },
      query: { token, limit: '20' },
    } as unknown as Request;
    const res = createMockResponse();

    await getManagerReviewBatchItemsByToken(req, res);

    expect(mockManagerReviewItemFind).toHaveBeenCalledWith({ batchId });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          id: itemId.toString(),
          userEmail: 'member@example.com',
          conversationId: 'conversation-1',
        }),
      ],
      nextCursor: null,
    });
  });

  it('submits a manager review response with a valid token', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const managerUserId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const token = 'valid-review-token';
    const replyTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    mockManagerReviewBatchFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'sent',
        replyTokenHash,
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockManagerReviewBatchFindByIdAndUpdate.mockReturnValue(
      createSelectLeanQuery({
        _id: batchId,
        batchKey: 'batch-key',
        managerUserId,
        departmentId,
        cadence: 'daily',
        periodStart: new Date('2026-04-20T00:00:00.000Z'),
        periodEnd: new Date('2026-04-21T00:00:00.000Z'),
        status: 'reviewed',
        responseStatus: 'not_ok',
        responseText: 'Needs follow-up',
        reviewedAt: new Date('2026-04-21T00:00:00.000Z'),
        itemCount: 1,
        transactionCount: 2,
        totalTokenValue: 10,
        totalRawAmount: 5,
        totalInputTokens: 6,
        totalWriteTokens: 3,
        totalReadTokens: 1,
        emailTo: 'manager@example.com',
      }),
    );
    mockManagerReviewItemUpdateMany.mockResolvedValue({ modifiedCount: 1 });

    const req = {
      params: { batchId: batchId.toString() },
      query: { token },
      body: { responseStatus: 'not_ok', responseText: 'Needs follow-up' },
    } as unknown as Request;
    const res = createMockResponse();

    await submitManagerReviewBatchResponseByToken(req, res);

    expect(mockManagerReviewItemUpdateMany).toHaveBeenCalledWith(
      { batchId, status: 'pending' },
      {
        $set: {
          status: 'not_ok',
          responseText: 'Needs follow-up',
          reviewedAt: expect.any(Date),
        },
      },
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'manager_review_batch.response.submit_by_token',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      batch: expect.objectContaining({
        id: batchId.toString(),
        status: 'reviewed',
        responseStatus: 'not_ok',
      }),
    });
  });
});
