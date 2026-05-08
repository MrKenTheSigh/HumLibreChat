import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockQuotaPeriodCreate = jest.fn();
const mockQuotaPeriodFind = jest.fn();
const mockQuotaPeriodFindById = jest.fn();
const mockQuotaPeriodFindByIdAndUpdate = jest.fn();
const mockQuotaPeriodFindOne = jest.fn();
const mockQuotaAccountCreate = jest.fn();
const mockQuotaAccountFind = jest.fn();
const mockQuotaAccountFindById = jest.fn();
const mockQuotaAccountFindOne = jest.fn();
const mockQuotaAccountUpdateOne = jest.fn();
const mockQuotaAllocationCreate = jest.fn();
const mockQuotaAllocationFind = jest.fn();
const mockQuotaAllocationFindById = jest.fn();
const mockQuotaGrantCreate = jest.fn();
const mockQuotaGrantFind = jest.fn();
const mockQuotaGrantFindById = jest.fn();
const mockQuotaGrantFindByIdAndUpdate = jest.fn();
const mockQuotaLedgerEntryCreate = jest.fn();
const mockQuotaLedgerEntryFind = jest.fn();
const mockDepartmentFind = jest.fn();
const mockDepartmentFindOne = jest.fn();
const mockUserFind = jest.fn();
const mockUserFindById = jest.fn();
const mockActivityLogCreate = jest.fn();
const mockLoggerError = jest.fn();
const originalQuotaMonthStartDay = process.env.QUOTA_MONTH_START_DAY;

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    ActivityLog: {
      create: mockActivityLogCreate,
    },
    Department: {
      find: mockDepartmentFind,
      findOne: mockDepartmentFindOne,
    },
    QuotaAccount: {
      create: mockQuotaAccountCreate,
      find: mockQuotaAccountFind,
      findById: mockQuotaAccountFindById,
      findOne: mockQuotaAccountFindOne,
      updateOne: mockQuotaAccountUpdateOne,
    },
    QuotaAllocation: {
      create: mockQuotaAllocationCreate,
      find: mockQuotaAllocationFind,
      findById: mockQuotaAllocationFindById,
    },
    QuotaGrant: {
      create: mockQuotaGrantCreate,
      find: mockQuotaGrantFind,
      findById: mockQuotaGrantFindById,
      findByIdAndUpdate: mockQuotaGrantFindByIdAndUpdate,
    },
    QuotaLedgerEntry: {
      create: mockQuotaLedgerEntryCreate,
      find: mockQuotaLedgerEntryFind,
    },
    QuotaPeriod: {
      create: mockQuotaPeriodCreate,
      find: mockQuotaPeriodFind,
      findById: mockQuotaPeriodFindById,
      findByIdAndUpdate: mockQuotaPeriodFindByIdAndUpdate,
      findOne: mockQuotaPeriodFindOne,
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const quotaHandlers = require('./quotas');
const {
  approveAdminQuotaGrantRequest,
  createAdminQuotaAllocation,
  createAdminQuotaGrant,
  createAdminQuotaGrantRequest,
  createAdminQuotaPeriod,
  getAdminQuotaAccounts,
  getAdminQuotaLedger,
} = quotaHandlers;

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

function createLeanOrFailQuery<T>(value: T) {
  return {
    lean: jest.fn().mockReturnValue({
      orFail: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe('admin quota handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUOTA_MONTH_START_DAY = '1';
  });

  afterAll(() => {
    if (originalQuotaMonthStartDay == null) {
      delete process.env.QUOTA_MONTH_START_DAY;
      return;
    }

    process.env.QUOTA_MONTH_START_DAY = originalQuotaMonthStartDay;
  });

  it('creates a quota period with a company account and initial ledger entry', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const companyAccountId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'Asia/Taipei',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T15:59:59.999Z'),
      status: 'draft',
      closePolicy: { billingDay: 1 },
    };
    const companyAccountRecord = {
      _id: companyAccountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 10000,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
      remainingCredits: 10000,
      warningThresholds: [0.8, 0.9, 1],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaPeriodCreate.mockResolvedValue({ _id: periodId });
    mockQuotaAccountCreate.mockResolvedValue({ _id: companyAccountId });
    mockQuotaPeriodFindById.mockReturnValue(createLeanOrFailQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanOrFailQuery(companyAccountRecord));

    const req = {
      user: { id: actorUserId.toString() },
      body: {
        year: 2026,
        month: 4,
        companyCredits: 10000,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaPeriod(req, res);

    expect(mockQuotaPeriodCreate).toHaveBeenCalledWith({
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      closePolicy: { billingDay: 1 },
    });
    expect(mockQuotaAccountCreate).toHaveBeenCalledWith({
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 10000,
      remainingCredits: 10000,
    });
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: companyAccountId,
        amount: 10000,
        entryType: 'allocation',
      }),
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'quota_period.create',
        resourceType: 'quota_period',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('creates all monthly quota periods for a year', async () => {
    const periodIds = Array.from({ length: 12 }, () => new mongoose.Types.ObjectId());
    const companyAccountIds = Array.from({ length: 12 }, () => new mongoose.Types.ObjectId());

    mockQuotaPeriodFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaPeriodCreate.mockImplementation((input: { periodKey: string }) => {
      const index = Number(input.periodKey.slice(5, 7)) - 1;
      return Promise.resolve({ _id: periodIds[index] });
    });
    mockQuotaAccountCreate.mockImplementation((input: { periodId: mongoose.Types.ObjectId }) => {
      const index = periodIds.findIndex((periodId) => periodId.equals(input.periodId));
      return Promise.resolve({ _id: companyAccountIds[index] });
    });
    mockQuotaPeriodFindById.mockImplementation((periodId: mongoose.Types.ObjectId) => {
      const index = periodIds.findIndex((id) => id.equals(periodId));
      const month = String(index + 1).padStart(2, '0');
      return createLeanOrFailQuery({
        _id: periodId,
        periodKey: `2026-${month}`,
        timezone: 'UTC',
        periodStart: new Date(2026, index, 1, 0, 0, 0, 0),
        periodEnd: new Date(new Date(2026, index + 1, 1, 0, 0, 0, 0).getTime() - 1),
        status: 'draft',
        closePolicy: { billingDay: 1 },
      });
    });
    mockQuotaAccountFindById.mockImplementation((accountId: mongoose.Types.ObjectId) => {
      const index = companyAccountIds.findIndex((id) => id.equals(accountId));
      return createLeanOrFailQuery({
        _id: accountId,
        periodId: periodIds[index],
        scopeType: 'company',
        scopeId: 'company',
        baseAllocatedCredits: 10000,
        extraGrantedCredits: 0,
        usedCredits: 0,
        reservedCredits: 0,
        remainingCredits: 10000,
        warningThresholds: [0.8, 0.9, 1],
        hardLimitEnabled: true,
        bufferCredits: 0,
      });
    });

    const req = {
      body: {
        year: 2026,
        createFullYear: true,
        companyCredits: 10000,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaPeriod(req, res);

    expect(mockQuotaPeriodFindOne).toHaveBeenCalledTimes(12);
    expect(mockQuotaPeriodCreate).toHaveBeenCalledTimes(12);
    expect(mockQuotaAccountCreate).toHaveBeenCalledTimes(12);
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledTimes(12);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        periods: expect.arrayContaining([
          expect.objectContaining({ periodKey: '2026-01' }),
          expect.objectContaining({ periodKey: '2026-12' }),
        ]),
      }),
    );
  });

  it('returns a readable validation error when the annual quota period year is missing', async () => {
    const req = {
      body: {
        createFullYear: true,
        companyCredits: 10000,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaPeriod(req, res);

    expect(mockQuotaPeriodCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'year is required' });
  });

  it('creates a quota period from a template period allocation structure', async () => {
    const templatePeriodId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const companyAccountId = new mongoose.Types.ObjectId();
    const departmentAccountId = new mongoose.Types.ObjectId();
    const templateCompanyAccountId = new mongoose.Types.ObjectId();
    const templateDepartmentAccountId = new mongoose.Types.ObjectId();

    mockQuotaPeriodFindOne.mockReturnValue(createSelectLeanQuery(null));
    mockQuotaPeriodCreate.mockResolvedValue({ _id: periodId });
    mockQuotaAccountCreate
      .mockResolvedValueOnce({ _id: companyAccountId })
      .mockResolvedValueOnce({ _id: departmentAccountId });
    mockQuotaAccountFind.mockReturnValue(
      createSortLeanQuery([
        {
          _id: templateCompanyAccountId,
          periodId: templatePeriodId,
          scopeType: 'company',
          scopeId: 'company',
          parentAccountId: null,
          baseAllocatedCredits: 10000,
          extraGrantedCredits: 0,
          usedCredits: 0,
          reservedCredits: 3000,
          remainingCredits: 10000,
          warningThresholds: [0.8, 0.9, 1],
          hardLimitEnabled: true,
          bufferCredits: 0,
        },
        {
          _id: templateDepartmentAccountId,
          periodId: templatePeriodId,
          scopeType: 'department',
          scopeId: 'dep_01',
          parentAccountId: templateCompanyAccountId,
          baseAllocatedCredits: 3000,
          extraGrantedCredits: 0,
          usedCredits: 120,
          reservedCredits: 0,
          remainingCredits: 2880,
          warningThresholds: [0.8, 0.9, 1],
          hardLimitEnabled: true,
          bufferCredits: 0,
        },
      ]),
    );
    mockQuotaPeriodFindById.mockReturnValue(
      createLeanOrFailQuery({
        _id: periodId,
        periodKey: '2026-05',
        timezone: 'UTC',
        periodStart: new Date('2026-05-01T00:00:00.000Z'),
        periodEnd: new Date('2026-05-31T23:59:59.999Z'),
        status: 'draft',
        closePolicy: { billingDay: 1 },
      }),
    );
    mockQuotaAccountFindById.mockReturnValue(
      createLeanOrFailQuery({
        _id: companyAccountId,
        periodId,
        scopeType: 'company',
        scopeId: 'company',
        baseAllocatedCredits: 10000,
        extraGrantedCredits: 0,
        usedCredits: 0,
        reservedCredits: 3000,
        remainingCredits: 10000,
        warningThresholds: [0.8, 0.9, 1],
        hardLimitEnabled: true,
        bufferCredits: 0,
      }),
    );

    const req = {
      body: {
        year: 2026,
        month: 5,
        companyCredits: 10000,
        templatePeriodId: templatePeriodId.toString(),
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaPeriod(req, res);

    expect(mockQuotaAccountCreate).toHaveBeenCalledWith({
      periodId,
      scopeType: 'department',
      scopeId: 'dep_01',
      parentAccountId: companyAccountId,
      baseAllocatedCredits: 3000,
      reservedCredits: 0,
      remainingCredits: 3000,
      warningThresholds: [0.8, 0.9, 1],
      hardLimitEnabled: true,
      bufferCredits: 0,
    });
    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: companyAccountId },
      { $set: { reservedCredits: 3000 } },
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects duplicate monthly quota periods before creating records', async () => {
    mockQuotaPeriodFindOne
      .mockReturnValueOnce(createSelectLeanQuery(null))
      .mockReturnValueOnce(createSelectLeanQuery({ _id: new mongoose.Types.ObjectId() }));

    const req = {
      body: {
        year: 2026,
        createFullYear: true,
        companyCredits: 10000,
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaPeriod(req, res);

    expect(mockQuotaPeriodCreate).not.toHaveBeenCalled();
    expect(mockQuotaAccountCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Quota period already exists' });
  });

  it('returns readable quota account labels with user department metadata', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const accounts = [
      {
        _id: new mongoose.Types.ObjectId(),
        periodId,
        scopeType: 'department',
        scopeId: departmentId.toString(),
        baseAllocatedCredits: 100,
        extraGrantedCredits: 0,
        usedCredits: 0,
        reservedCredits: 0,
        remainingCredits: 100,
        warningThresholds: [0.8],
        hardLimitEnabled: true,
        bufferCredits: 0,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        periodId,
        scopeType: 'user',
        scopeId: userId.toString(),
        baseAllocatedCredits: 25,
        extraGrantedCredits: 0,
        usedCredits: 0,
        reservedCredits: 0,
        remainingCredits: 25,
        warningThresholds: [0.8],
        hardLimitEnabled: true,
        bufferCredits: 0,
      },
    ];
    const department = {
      _id: departmentId,
      code: 'D01',
      name: 'Finance',
      enabled: true,
    };

    mockQuotaAccountFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(accounts),
    });
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: userId,
          name: 'Ken Huang',
          username: 'ken',
          email: 'ken@example.com',
          departmentId,
        },
      ]),
    });
    mockDepartmentFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([department]),
    });

    const req = {
      query: { periodId: periodId.toString() },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminQuotaAccounts(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      accounts: [
        expect.objectContaining({
          scopeType: 'department',
          scopeLabel: 'Finance (D01)',
          department: {
            id: departmentId.toString(),
            code: 'D01',
            name: 'Finance',
            enabled: true,
          },
        }),
        expect.objectContaining({
          scopeType: 'user',
          scopeLabel: 'ken@example.com',
          scopeSecondaryLabel: 'ken / Ken Huang',
          department: {
            id: departmentId.toString(),
            code: 'D01',
            name: 'Finance',
            enabled: true,
          },
        }),
      ],
    });
  });

  it('returns quota ledger entries with account and counterparty metadata', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const allocationId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const toAccountId = new mongoose.Types.ObjectId();
    const fromDepartmentId = new mongoose.Types.ObjectId();
    const toDepartmentId = new mongoose.Types.ObjectId();
    const ledgerEntry = {
      _id: new mongoose.Types.ObjectId(),
      periodId,
      accountId: toAccountId,
      counterpartyAccountId: fromAccountId,
      entryType: 'allocation',
      amount: 10,
      balanceAfter: 25,
      sourceType: 'admin_action',
      sourceId: allocationId.toString(),
      reason: 'Team monthly limit',
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'department',
      scopeId: fromDepartmentId.toString(),
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 10,
      remainingCredits: 100,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const toAccount = {
      _id: toAccountId,
      periodId,
      scopeType: 'department',
      scopeId: toDepartmentId.toString(),
      baseAllocatedCredits: 25,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
      remainingCredits: 25,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaLedgerEntryFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([ledgerEntry]),
    });
    mockQuotaAllocationFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: allocationId,
          periodId,
          fromAccountId,
          toAccountId,
          amount: 10,
          status: 'active',
          reason: 'Team monthly limit',
        },
      ]),
    });
    mockQuotaAccountFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([fromAccount, toAccount]),
    });
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    mockDepartmentFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: fromDepartmentId,
          code: 'HQ',
          name: 'Head Office',
          enabled: true,
        },
        {
          _id: toDepartmentId,
          code: 'D01',
          name: 'Finance',
          enabled: true,
        },
      ]),
    });

    const req = {
      query: { periodId: periodId.toString(), limit: '10' },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminQuotaLedger(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ledger: [
        expect.objectContaining({
          account: expect.objectContaining({
            id: toAccountId.toString(),
            scopeLabel: 'Finance (D01)',
          }),
          counterpartyAccountId: fromAccountId.toString(),
          counterpartyAccount: expect.objectContaining({
            id: fromAccountId.toString(),
            scopeLabel: 'Head Office (HQ)',
          }),
          allocation: {
            fromAccount: expect.objectContaining({
              id: fromAccountId.toString(),
              scopeLabel: 'Head Office (HQ)',
            }),
            toAccount: expect.objectContaining({
              id: toAccountId.toString(),
              scopeLabel: 'Finance (D01)',
            }),
          },
        }),
      ],
      nextCursor: null,
    });
  });

  it('pairs legacy allocation ledger entries that do not have a source id', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const toAccountId = new mongoose.Types.ObjectId();
    const fromDepartmentId = new mongoose.Types.ObjectId();
    const toDepartmentId = new mongoose.Types.ObjectId();
    const sourceCreatedAt = new Date('2026-04-03T00:00:00.000Z');
    const targetCreatedAt = new Date('2026-04-03T00:00:00.137Z');
    const actorUserId = new mongoose.Types.ObjectId();
    const fromEntry = {
      _id: new mongoose.Types.ObjectId(),
      periodId,
      accountId: fromAccountId,
      entryType: 'allocation',
      amount: -10,
      balanceAfter: 60,
      sourceType: 'admin_action',
      reason: 'Team monthly limit',
      actorUserId,
      createdAt: sourceCreatedAt,
    };
    const toEntry = {
      _id: new mongoose.Types.ObjectId(),
      periodId,
      accountId: toAccountId,
      entryType: 'allocation',
      amount: 10,
      balanceAfter: 25,
      sourceType: 'admin_action',
      reason: 'Team monthly limit',
      actorUserId,
      createdAt: targetCreatedAt,
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'department',
      scopeId: fromDepartmentId.toString(),
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 10,
      remainingCredits: 100,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const toAccount = {
      _id: toAccountId,
      periodId,
      scopeType: 'department',
      scopeId: toDepartmentId.toString(),
      baseAllocatedCredits: 25,
      extraGrantedCredits: 0,
      usedCredits: 0,
      reservedCredits: 0,
      remainingCredits: 25,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaLedgerEntryFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([fromEntry, toEntry]),
    });
    mockQuotaAccountFind.mockReturnValue({
      lean: jest.fn().mockResolvedValue([fromAccount, toAccount]),
    });
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    mockDepartmentFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: fromDepartmentId,
          code: 'HQ',
          name: 'Head Office',
          enabled: true,
        },
        {
          _id: toDepartmentId,
          code: 'D01',
          name: 'Finance',
          enabled: true,
        },
      ]),
    });

    const req = {
      query: { periodId: periodId.toString(), limit: '10' },
    } as unknown as Request;
    const res = createMockResponse();

    await getAdminQuotaLedger(req, res);

    expect(mockQuotaAllocationFind).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ledger: [
        expect.objectContaining({
          account: expect.objectContaining({ id: fromAccountId.toString() }),
          counterpartyAccountId: toAccountId.toString(),
          counterpartyAccount: expect.objectContaining({
            id: toAccountId.toString(),
            scopeLabel: 'Finance (D01)',
          }),
          allocation: {
            fromAccount: expect.objectContaining({
              id: fromAccountId.toString(),
              scopeLabel: 'Head Office (HQ)',
            }),
            toAccount: expect.objectContaining({
              id: toAccountId.toString(),
              scopeLabel: 'Finance (D01)',
            }),
          },
        }),
        expect.objectContaining({
          account: expect.objectContaining({ id: toAccountId.toString() }),
          counterpartyAccountId: fromAccountId.toString(),
          counterpartyAccount: expect.objectContaining({
            id: fromAccountId.toString(),
            scopeLabel: 'Head Office (HQ)',
          }),
          allocation: {
            fromAccount: expect.objectContaining({
              id: fromAccountId.toString(),
              scopeLabel: 'Head Office (HQ)',
            }),
            toAccount: expect.objectContaining({
              id: toAccountId.toString(),
              scopeLabel: 'Finance (D01)',
            }),
          },
        }),
      ],
      nextCursor: null,
    });
  });

  it('rejects allocation when the source account has insufficient credits', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'company',
      baseAllocatedCredits: 10,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 0,
      remainingCredits: 10,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(fromAccount));

    const req = {
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'department',
        scopeId: new mongoose.Types.ObjectId().toString(),
        amount: 11,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAllocationCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient quota credits' });
  });

  it('rejects allocation when the target is the source account', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const scopeId = new mongoose.Types.ObjectId().toString();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'department',
      scopeId,
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 0,
      remainingCredits: 100,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(fromAccount));

    const req = {
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'department',
        scopeId,
        amount: 10,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAccountFindOne).not.toHaveBeenCalled();
    expect(mockQuotaAllocationCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot allocate quota to the source account',
    });
  });

  it('rejects department quota allocation to a user outside the source department', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const sourceDepartmentId = new mongoose.Types.ObjectId();
    const otherDepartmentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'department',
      scopeId: sourceDepartmentId.toString(),
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 0,
      remainingCredits: 100,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(fromAccount));
    mockUserFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: userId,
        departmentId: otherDepartmentId,
      }),
    );

    const req = {
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'user',
        scopeId: userId.toString(),
        amount: 10,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAccountFindOne).not.toHaveBeenCalled();
    expect(mockQuotaAllocationCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot allocate department quota to a user outside the department',
    });
  });

  it('rejects company quota allocation directly to a non-company user', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const companyDepartmentId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 0,
      remainingCredits: 100,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(fromAccount));
    mockUserFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: userId,
        departmentId,
      }),
    );
    mockDepartmentFindOne.mockReturnValue(
      createSelectLeanQuery({
        _id: companyDepartmentId,
      }),
    );

    const req = {
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'user',
        scopeId: userId.toString(),
        amount: 10,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAccountFindOne).not.toHaveBeenCalled();
    expect(mockQuotaAllocationCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot allocate company quota directly to a non-company user',
    });
  });

  it('rejects company quota allocation directly to a user without a department', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 0,
      remainingCredits: 100,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(fromAccount));
    mockUserFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: userId,
        departmentId: null,
      }),
    );

    const req = {
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'user',
        scopeId: userId.toString(),
        amount: 10,
      },
    } as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAccountFindOne).not.toHaveBeenCalled();
    expect(mockQuotaAllocationCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Cannot allocate company quota directly to a user without a department',
    });
  });

  it('allocates quota limit without reducing source usable remaining credits', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const fromAccountId = new mongoose.Types.ObjectId();
    const toAccountId = new mongoose.Types.ObjectId();
    const allocationId = new mongoose.Types.ObjectId();
    const scopeId = new mongoose.Types.ObjectId().toString();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const fromAccount = {
      _id: fromAccountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      reservedCredits: 30,
      usedCredits: 10,
      remainingCredits: 90,
      bufferCredits: 0,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
    };
    const toAccount = {
      _id: toAccountId,
      periodId,
      scopeType: 'department',
      scopeId,
      parentAccountId: fromAccountId,
      baseAllocatedCredits: 20,
      extraGrantedCredits: 0,
      reservedCredits: 0,
      usedCredits: 5,
      remainingCredits: 15,
      bufferCredits: 0,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
    };
    const storedFromAccount = { ...fromAccount, reservedCredits: 40 };
    const storedToAccount = { ...toAccount, baseAllocatedCredits: 30, remainingCredits: 25 };
    const allocationRecord = {
      _id: allocationId,
      periodId,
      fromAccountId,
      toAccountId,
      amount: 10,
      status: 'active',
      reason: 'Team monthly limit',
      actorUserId,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById
      .mockReturnValueOnce(createLeanQuery(fromAccount))
      .mockReturnValueOnce(createLeanOrFailQuery(storedToAccount))
      .mockReturnValueOnce(createLeanOrFailQuery(storedFromAccount));
    mockQuotaAccountFindOne.mockReturnValue(createLeanQuery(toAccount));
    mockQuotaAllocationCreate.mockResolvedValue({ _id: allocationId });
    mockQuotaAllocationFindById.mockReturnValue(createLeanOrFailQuery(allocationRecord));

    const req = {
      user: { id: actorUserId.toString() },
      body: {
        periodId: periodId.toString(),
        fromAccountId: fromAccountId.toString(),
        scopeType: 'department',
        scopeId,
        amount: 10,
        reason: 'Team monthly limit',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaAllocation(req, res);

    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: fromAccountId },
      {
        $set: {
          reservedCredits: 40,
          remainingCredits: 90,
        },
      },
    );
    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: toAccountId },
      {
        $set: {
          baseAllocatedCredits: 30,
          remainingCredits: 25,
        },
      },
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: fromAccountId,
        counterpartyAccountId: toAccountId,
        amount: -10,
        balanceAfter: 60,
        entryType: 'allocation',
      }),
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: toAccountId,
        counterpartyAccountId: fromAccountId,
        amount: 10,
        balanceAfter: 25,
        entryType: 'allocation',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('creates an approved company quota grant and updates the company account', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const grantId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const targetAccount = {
      _id: accountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 0,
      extraGrantedCredits: 100,
      usedCredits: 50,
      remainingCredits: 50,
      bufferCredits: 0,
    };
    const updatedAccount = {
      ...targetAccount,
      extraGrantedCredits: 125,
      remainingCredits: 75,
      baseAllocatedCredits: 1000,
      usedCredits: 950,
      reservedCredits: 0,
      warningThresholds: [0.8, 0.9, 1],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const grantRecord = {
      _id: grantId,
      periodId,
      targetAccountId: accountId,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      amount: 25,
      reason: 'Deadline support',
      status: 'approved',
      expiresAt: periodRecord.periodEnd,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById
      .mockReturnValueOnce(createLeanQuery(targetAccount))
      .mockReturnValueOnce(createLeanOrFailQuery(updatedAccount));
    mockQuotaGrantCreate.mockResolvedValue({ _id: grantId });
    mockQuotaGrantFindById.mockReturnValue(createLeanOrFailQuery(grantRecord));

    const req = {
      user: { id: actorUserId.toString() },
      body: {
        periodId: periodId.toString(),
        targetAccountId: accountId.toString(),
        amount: 25,
        reason: 'Deadline support',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaGrant(req, res);

    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: accountId },
      {
        $set: {
          extraGrantedCredits: 125,
          remainingCredits: 75,
        },
      },
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        amount: 25,
        balanceAfter: 75,
        entryType: 'grant',
      }),
    );
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'quota_grant.approve',
        resourceType: 'quota_grant',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('creates a pending company quota grant request without updating the company account', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const grantId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const targetAccount = {
      _id: accountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      extraGrantedCredits: 0,
      remainingCredits: 100,
    };
    const grantRecord = {
      _id: grantId,
      periodId,
      targetAccountId: accountId,
      requestedByUserId: actorUserId,
      approvedByUserId: null,
      amount: 40,
      reason: 'Need room for a delivery spike',
      status: 'requested',
      expiresAt: periodRecord.periodEnd,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(targetAccount));
    mockQuotaGrantCreate.mockResolvedValue({ _id: grantId });
    mockQuotaGrantFindById.mockReturnValue(createLeanOrFailQuery(grantRecord));

    const req = {
      user: { id: actorUserId.toString() },
      body: {
        periodId: periodId.toString(),
        targetAccountId: accountId.toString(),
        amount: 40,
        reason: 'Need room for a delivery spike',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaGrantRequest(req, res);

    expect(mockQuotaGrantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        periodId,
        targetAccountId: accountId,
        requestedByUserId: actorUserId,
        approvedByUserId: null,
        amount: 40,
        reason: 'Need room for a delivery spike',
        status: 'requested',
      }),
    );
    expect(mockQuotaAccountUpdateOne).not.toHaveBeenCalled();
    expect(mockQuotaLedgerEntryCreate).not.toHaveBeenCalled();
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'quota_grant.request',
        resourceType: 'quota_grant',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects quota grant requests for non-company accounts', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const targetAccount = {
      _id: accountId,
      periodId,
      scopeType: 'department',
      scopeId: new mongoose.Types.ObjectId().toString(),
      extraGrantedCredits: 0,
      remainingCredits: 100,
    };

    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById.mockReturnValue(createLeanQuery(targetAccount));

    const req = {
      body: {
        periodId: periodId.toString(),
        targetAccountId: accountId.toString(),
        amount: 40,
        reason: 'Need room for a delivery spike',
      },
    } as unknown as Request;
    const res = createMockResponse();

    await createAdminQuotaGrantRequest(req, res);

    expect(mockQuotaGrantCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Quota grant requests can only target the company account',
    });
  });

  it('approves a pending company quota grant request and applies credits once', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const periodId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const grantId = new mongoose.Types.ObjectId();
    const periodRecord = {
      _id: periodId,
      periodKey: '2026-04',
      timezone: 'UTC',
      periodStart: new Date('2026-04-01T00:00:00.000Z'),
      periodEnd: new Date('2026-04-30T23:59:59.999Z'),
      status: 'active',
    };
    const targetAccount = {
      _id: accountId,
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      baseAllocatedCredits: 100,
      extraGrantedCredits: 10,
      usedCredits: 20,
      remainingCredits: 90,
      bufferCredits: 0,
    };
    const requestedGrant = {
      _id: grantId,
      periodId,
      targetAccountId: accountId,
      requestedByUserId: new mongoose.Types.ObjectId(),
      approvedByUserId: null,
      amount: 40,
      reason: 'Need room for a delivery spike',
      status: 'requested',
      expiresAt: periodRecord.periodEnd,
    };
    const approvedGrant = {
      ...requestedGrant,
      approvedByUserId: actorUserId,
      status: 'approved',
    };
    const updatedAccount = {
      ...targetAccount,
      baseAllocatedCredits: 1000,
      extraGrantedCredits: 50,
      usedCredits: 910,
      reservedCredits: 0,
      remainingCredits: 130,
      warningThresholds: [0.8, 0.9, 1],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaGrantFindById.mockReturnValueOnce(createLeanQuery(requestedGrant));
    mockQuotaGrantFindByIdAndUpdate.mockReturnValue(createLeanQuery(approvedGrant));
    mockQuotaPeriodFindById.mockReturnValue(createLeanQuery(periodRecord));
    mockQuotaAccountFindById
      .mockReturnValueOnce(createLeanQuery(targetAccount))
      .mockReturnValueOnce(createLeanOrFailQuery(updatedAccount));
    mockQuotaGrantFindById.mockReturnValueOnce(createLeanOrFailQuery(approvedGrant));

    const req = {
      user: { id: actorUserId.toString() },
      params: { grantId: grantId.toString() },
      body: { reason: 'Approved by admin' },
    } as unknown as Request;
    const res = createMockResponse();

    await approveAdminQuotaGrantRequest(req, res);

    expect(mockQuotaGrantFindByIdAndUpdate).toHaveBeenCalledWith(
      grantId,
      expect.objectContaining({
        $set: expect.objectContaining({
          approvedByUserId: actorUserId,
          status: 'approved',
        }),
      }),
      { new: true },
    );
    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: accountId },
      {
        $set: {
          extraGrantedCredits: 50,
          remainingCredits: 130,
        },
      },
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: grantId.toString(),
        amount: 40,
        balanceAfter: 130,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
