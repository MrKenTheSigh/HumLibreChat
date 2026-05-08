import mongoose from 'mongoose';

const mockQuotaPeriodFindOne = jest.fn();
const mockQuotaAccountFindOne = jest.fn();
const mockQuotaAccountFindById = jest.fn();
const mockQuotaAccountUpdateOne = jest.fn();
const mockQuotaLedgerEntryCreate = jest.fn();
const mockUserFindById = jest.fn();
const mockDepartmentFindById = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    Department: {
      findById: mockDepartmentFindById,
    },
    QuotaAccount: {
      findById: mockQuotaAccountFindById,
      findOne: mockQuotaAccountFindOne,
      updateOne: mockQuotaAccountUpdateOne,
    },
    QuotaLedgerEntry: {
      create: mockQuotaLedgerEntryCreate,
    },
    QuotaPeriod: {
      findOne: mockQuotaPeriodFindOne,
    },
    User: {
      findById: mockUserFindById,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkQuotaAvailability, recordQuotaUsageForTransactions } = require('./quotaUsage');

function createActivePeriodQuery(period: { _id: mongoose.Types.ObjectId }) {
  return {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(period),
  };
}

function createLeanQuery<T>(value: T) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('quota usage helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deducts transaction credits from user, department, and company accounts', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const userAccountId = new mongoose.Types.ObjectId();
    const departmentAccountId = new mongoose.Types.ObjectId();
    const companyAccountId = new mongoose.Types.ObjectId();
    const period = { _id: periodId };
    const userAccount = {
      _id: userAccountId,
      periodId,
      scopeType: 'user',
      scopeId: userId.toString(),
      parentAccountId: departmentAccountId,
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      usedCredits: 70,
      remainingCredits: 30,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };
    const departmentAccount = {
      ...userAccount,
      _id: departmentAccountId,
      scopeType: 'department',
      scopeId: new mongoose.Types.ObjectId().toString(),
      parentAccountId: companyAccountId,
      baseAllocatedCredits: 1000,
      usedCredits: 100,
      remainingCredits: 900,
      warningThresholds: [0.8],
    };
    const companyAccount = {
      ...userAccount,
      _id: companyAccountId,
      scopeType: 'company',
      scopeId: 'company',
      parentAccountId: null,
      baseAllocatedCredits: 5000,
      usedCredits: 1000,
      remainingCredits: 4000,
      warningThresholds: [0.8],
    };

    mockQuotaPeriodFindOne.mockReturnValue(createActivePeriodQuery(period));
    mockQuotaAccountFindOne.mockReturnValue(createLeanQuery(userAccount));
    mockQuotaAccountFindById
      .mockReturnValueOnce(createLeanQuery(departmentAccount))
      .mockReturnValueOnce(createLeanQuery(companyAccount));

    await recordQuotaUsageForTransactions({
      userId: userId.toString(),
      transactions: [
        {
          user: userId.toString(),
          tokenType: 'prompt',
          tokenValue: -8,
          context: 'message',
          conversationId: 'conversation-1',
          messageId: 'message-1',
        },
        {
          user: userId.toString(),
          tokenType: 'completion',
          tokenValue: -7,
          context: 'message',
          conversationId: 'conversation-1',
          messageId: 'message-1',
        },
      ],
    });

    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledTimes(3);
    expect(mockQuotaAccountUpdateOne).toHaveBeenCalledWith(
      { _id: userAccountId },
      { $set: { usedCredits: 85, remainingCredits: 15 } },
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: userAccountId,
        amount: -15,
        balanceAfter: 15,
        entryType: 'usage',
      }),
    );
    expect(mockQuotaLedgerEntryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: userAccountId,
        entryType: 'warning',
      }),
    );
  });

  it('returns unavailable when an account in the chain lacks estimated credits', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const userAccountId = new mongoose.Types.ObjectId();
    const userAccount = {
      _id: userAccountId,
      periodId,
      scopeType: 'user',
      scopeId: userId.toString(),
      parentAccountId: null,
      baseAllocatedCredits: 100,
      extraGrantedCredits: 0,
      usedCredits: 99,
      remainingCredits: 1,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindOne.mockReturnValue(createActivePeriodQuery({ _id: periodId }));
    mockQuotaAccountFindOne.mockReturnValue(createLeanQuery(userAccount));

    const result = await checkQuotaAvailability({
      userId: userId.toString(),
      estimatedCredits: 2,
    });

    expect(result).toEqual({
      canSpend: false,
      accountId: userAccountId.toString(),
      scopeType: 'user',
      remainingCredits: 1,
    });
  });

  it('falls back to department account when the user account does not exist', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const departmentAccount = {
      _id: new mongoose.Types.ObjectId(),
      periodId,
      scopeType: 'department',
      scopeId: departmentId.toString(),
      parentAccountId: null,
      baseAllocatedCredits: 1000,
      extraGrantedCredits: 0,
      usedCredits: 0,
      remainingCredits: 1000,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindOne.mockReturnValue(createActivePeriodQuery({ _id: periodId }));
    mockQuotaAccountFindOne
      .mockReturnValueOnce(createLeanQuery(null))
      .mockReturnValueOnce(createLeanQuery(departmentAccount));
    mockUserFindById.mockReturnValue(createSelectLeanQuery({ _id: userId, departmentId }));
    mockDepartmentFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: departmentId,
        code: 'DEP_01',
      }),
    );

    const result = await checkQuotaAvailability({
      userId: userId.toString(),
      estimatedCredits: 2,
    });

    expect(result).toEqual({ canSpend: true });
    expect(mockUserFindById).toHaveBeenCalledWith(userId.toString());
  });

  it('falls back to company account for a user directly assigned to the company department', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const companyDepartmentId = new mongoose.Types.ObjectId();
    const companyAccount = {
      _id: new mongoose.Types.ObjectId(),
      periodId,
      scopeType: 'company',
      scopeId: 'company',
      parentAccountId: null,
      baseAllocatedCredits: 1000,
      extraGrantedCredits: 0,
      usedCredits: 0,
      remainingCredits: 1000,
      warningThresholds: [0.8],
      hardLimitEnabled: true,
      bufferCredits: 0,
    };

    mockQuotaPeriodFindOne.mockReturnValue(createActivePeriodQuery({ _id: periodId }));
    mockQuotaAccountFindOne
      .mockReturnValueOnce(createLeanQuery(null))
      .mockReturnValueOnce(createLeanQuery(companyAccount));
    mockUserFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: userId,
        departmentId: companyDepartmentId,
      }),
    );
    mockDepartmentFindById.mockReturnValue(
      createSelectLeanQuery({
        _id: companyDepartmentId,
        code: 'COMPANY',
      }),
    );

    const result = await checkQuotaAvailability({
      userId: userId.toString(),
      estimatedCredits: 2,
    });

    expect(result).toEqual({ canSpend: true });
    expect(mockQuotaAccountFindOne).toHaveBeenNthCalledWith(2, {
      periodId,
      scopeType: 'company',
      scopeId: 'company',
    });
  });

  it('does not fall back to company account for a user without a department', async () => {
    const periodId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    mockQuotaPeriodFindOne.mockReturnValue(createActivePeriodQuery({ _id: periodId }));
    mockQuotaAccountFindOne.mockReturnValueOnce(createLeanQuery(null));
    mockUserFindById.mockReturnValue(createSelectLeanQuery({ _id: userId, departmentId: null }));

    const result = await checkQuotaAvailability({
      userId: userId.toString(),
      estimatedCredits: 2,
    });

    expect(result).toEqual({ canSpend: true });
    expect(mockDepartmentFindById).not.toHaveBeenCalled();
    expect(mockQuotaAccountFindOne).toHaveBeenCalledTimes(1);
  });
});
