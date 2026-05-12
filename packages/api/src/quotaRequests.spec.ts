import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockDepartmentFindById = jest.fn();
const mockQuotaAccountCreate = jest.fn();
const mockQuotaAccountFind = jest.fn();
const mockQuotaAccountFindById = jest.fn();
const mockQuotaAccountFindOne = jest.fn();
const mockQuotaPeriodFindOne = jest.fn();
const mockQuotaRequestCreate = jest.fn();
const mockQuotaRequestFind = jest.fn();
const mockQuotaRequestFindById = jest.fn();
const mockQuotaRequestFindOne = jest.fn();
const mockUserFindById = jest.fn();
const mockLoggerError = jest.fn();
const mockWriteRequestActivityLog = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Department: {
      findById: mockDepartmentFindById,
    },
    QuotaAccount: {
      create: mockQuotaAccountCreate,
      find: mockQuotaAccountFind,
      findById: mockQuotaAccountFindById,
      findOne: mockQuotaAccountFindOne,
    },
    QuotaPeriod: {
      findOne: mockQuotaPeriodFindOne,
    },
    QuotaRequest: {
      create: mockQuotaRequestCreate,
      find: mockQuotaRequestFind,
      findById: mockQuotaRequestFindById,
      findOne: mockQuotaRequestFindOne,
    },
    User: {
      findById: mockUserFindById,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

jest.mock('./admin/activityLogs', () => ({
  writeRequestActivityLog: mockWriteRequestActivityLog,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createUserQuotaRequest, getUserQuotaRequests } = require('./quotaRequests');

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

function createLeanQuery<T>(value: T) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSortLeanQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSortLimitLeanQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createLeanOrFailQuery<T>(value: T) {
  return {
    lean: jest.fn().mockReturnValue({
      orFail: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe('user quota request handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a user quota account under the user department source before creating a request', async () => {
    const userId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const sourceAccountId = new mongoose.Types.ObjectId();
    const targetAccountId = new mongoose.Types.ObjectId();
    const requestId = new mongoose.Types.ObjectId();
    const period = {
      _id: periodId,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
      status: 'active',
    };
    const sourceAccount = {
      _id: sourceAccountId,
      periodId,
      scopeType: 'department',
      scopeId: departmentId.toString(),
      baseAllocatedCredits: 1000,
      extraGrantedCredits: 0,
      usedCredits: 100,
      reservedCredits: 200,
      remainingCredits: 900,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const targetAccount = {
      _id: targetAccountId,
      periodId,
      scopeType: 'user',
      scopeId: userId.toString(),
      parentAccountId: sourceAccountId,
      baseAllocatedCredits: 0,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
      remainingCredits: 0,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const requestRecord = {
      _id: requestId,
      periodId,
      sourceAccountId,
      targetAccountId,
      requestedByUserId: userId,
      reviewedByUserId: null,
      fulfilledAllocationId: null,
      amount: 50,
      reason: 'Need more quota',
      status: 'pending',
      requestedAt: new Date('2026-05-10T00:00:00.000Z'),
    };

    mockQuotaPeriodFindOne.mockReturnValue(createSortLeanQuery(period));
    mockQuotaAccountFindOne
      .mockReturnValueOnce(createLeanQuery(null))
      .mockReturnValueOnce(createLeanQuery(sourceAccount));
    mockUserFindById.mockReturnValue(createSelectLeanQuery({ _id: userId, departmentId }));
    mockDepartmentFindById.mockReturnValue(
      createSelectLeanQuery({ _id: departmentId, code: 'DEP_01' }),
    );
    mockQuotaAccountCreate.mockResolvedValue({ _id: targetAccountId });
    mockQuotaAccountFindById.mockReturnValue(createLeanOrFailQuery(targetAccount));
    mockQuotaRequestFindOne.mockReturnValue(createLeanQuery(null));
    mockQuotaRequestCreate.mockResolvedValue({ _id: requestId });
    mockQuotaRequestFindById.mockReturnValue(createLeanOrFailQuery(requestRecord));

    const req = {
      user: { id: userId.toString() },
      body: {
        amount: 50,
        reason: 'Need more quota',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createUserQuotaRequest(req, res);

    expect(mockQuotaAccountCreate).toHaveBeenCalledWith({
      periodId,
      scopeType: 'user',
      scopeId: userId.toString(),
      parentAccountId: sourceAccountId,
    });
    expect(mockQuotaRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodId,
        sourceAccountId,
        targetAccountId,
        requestedByUserId: userId,
        amount: 50,
        status: 'pending',
      }),
    );
    expect(mockWriteRequestActivityLog).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        action: 'quota_request.user_create',
        resourceType: 'quota_request',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects duplicate pending user quota requests for the same source and target account', async () => {
    const userId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const sourceAccountId = new mongoose.Types.ObjectId();
    const targetAccountId = new mongoose.Types.ObjectId();
    const period = {
      _id: periodId,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
      status: 'active',
    };
    const targetAccount = {
      _id: targetAccountId,
      periodId,
      scopeType: 'user',
      scopeId: userId.toString(),
      parentAccountId: sourceAccountId,
      baseAllocatedCredits: 0,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
      remainingCredits: 0,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const sourceAccount = {
      _id: sourceAccountId,
      periodId,
      scopeType: 'department',
      scopeId: new mongoose.Types.ObjectId().toString(),
      baseAllocatedCredits: 1000,
      extraGrantedCredits: 0,
      usedCredits: 100,
      reservedCredits: 200,
      remainingCredits: 900,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindOne.mockReturnValue(createSortLeanQuery(period));
    mockQuotaAccountFindOne.mockReturnValueOnce(createLeanQuery(targetAccount));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(sourceAccount));
    mockQuotaRequestFindOne.mockReturnValue(
      createLeanQuery({
        _id: new mongoose.Types.ObjectId(),
        periodId,
        sourceAccountId,
        targetAccountId,
        requestedByUserId: userId,
        amount: 50,
        reason: 'Need more quota',
        status: 'pending',
        requestedAt: new Date('2026-05-10T00:00:00.000Z'),
      }),
    );

    const req = {
      user: { id: userId.toString() },
      body: {
        amount: 50,
        reason: 'Need more quota',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createUserQuotaRequest(req, res);

    expect(mockQuotaRequestCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.status().json).toHaveBeenCalledWith({
      message: 'A quota request is already pending',
    });
  });

  it('lists only quota requests created by the current user', async () => {
    const userId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const sourceAccountId = new mongoose.Types.ObjectId();
    const targetAccountId = new mongoose.Types.ObjectId();
    const requestId = new mongoose.Types.ObjectId();
    const requestRecord = {
      _id: requestId,
      periodId,
      sourceAccountId,
      targetAccountId,
      requestedByUserId: userId,
      reviewedByUserId: new mongoose.Types.ObjectId(),
      fulfilledAllocationId: new mongoose.Types.ObjectId(),
      amount: 50,
      reason: 'Need more quota',
      reviewReason: 'Approved',
      status: 'approved',
      requestedAt: new Date('2026-05-10T00:00:00.000Z'),
      reviewedAt: new Date('2026-05-10T01:00:00.000Z'),
      createdAt: new Date('2026-05-10T00:00:00.000Z'),
    };

    mockQuotaRequestFind.mockReturnValue(createSortLimitLeanQuery([requestRecord]));
    mockQuotaAccountFind.mockReturnValue(createLeanQuery([]));

    const req = {
      user: { id: userId.toString() },
      query: {
        status: 'approved',
        limit: '5',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await getUserQuotaRequests(req, res);

    expect(mockQuotaRequestFind).toHaveBeenCalledWith({
      $and: [{ requestedByUserId: userId }, { status: 'approved' }],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.status().json).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          id: requestId.toString(),
          status: 'approved',
          requestedByUserId: userId.toString(),
        }),
      ],
      nextCursor: null,
    });
  });
});
