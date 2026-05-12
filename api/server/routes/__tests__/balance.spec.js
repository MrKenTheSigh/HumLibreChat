const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  getBalanceConfig: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  configMiddleware: (req, res, next) => next(),
}));

jest.mock('~/db/models', () => ({
  Balance: {
    findOne: jest.fn(),
  },
  Department: {
    findById: jest.fn(),
  },
  QuotaAccount: {
    findOne: jest.fn(),
  },
  QuotaPeriod: {
    findOne: jest.fn(),
  },
  User: {
    findById: jest.fn(),
  },
  AdminPlan: {
    findById: jest.fn(),
  },
}));

describe('GET /api/balance', () => {
  let app;
  const { getBalanceConfig } = require('@librechat/api');
  const {
    Balance,
    Department,
    QuotaAccount,
    QuotaPeriod,
    User,
    AdminPlan,
  } = require('~/db/models');

  beforeAll(() => {
    const balanceRouter = require('../balance');

    app = express();
    app.use((req, res, next) => {
      req.user = { id: 'user-123' };
      req.config = {
        balance: {
          enabled: true,
          startBalance: 5000,
        },
      };
      next();
    });
    app.use('/api/balance', balanceRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getBalanceConfig.mockReturnValue({ enabled: true, startBalance: 5000 });
    QuotaPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    QuotaAccount.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    Department.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
  });

  it('returns quota derived from an active user quota account before legacy balance', async () => {
    const period = {
      _id: { toString: () => 'period-1' },
      periodEnd: new Date('2026-05-31T23:59:59.999Z'),
    };
    const account = {
      _id: { toString: () => 'account-1' },
      baseAllocatedCredits: 66,
      extraGrantedCredits: 0,
      usedCredits: 11,
      bufferCredits: 0,
    };

    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 20000,
        tokenCreditsLimit: 20000,
        autoRefillEnabled: false,
      }),
    });
    QuotaPeriod.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(period),
      }),
    });
    QuotaAccount.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(account),
    });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.quota).toEqual({
      periodId: 'period-1',
      quotaAccountId: 'account-1',
      periodTotalCredits: 66,
      periodUsedCredits: 11,
      periodRemainingCredits: 55,
      usageRatio: 11 / 66,
      resetAt: '2026-05-31T23:59:59.999Z',
    });
  });

  it('does not expose stored legacy balance when legacy balance is disabled', async () => {
    getBalanceConfig.mockReturnValue({ enabled: false, startBalance: 5000 });
    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 20000,
        tokenCreditsLimit: 20000,
        autoRefillEnabled: false,
      }),
    });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.tokenCredits).toBe(0);
    expect(response.body.tokenCreditsLimit).toBe(0);
    expect(response.body.quota).toBeUndefined();
  });

  it('returns inactive quota state instead of legacy quota when current period is draft', async () => {
    const draftPeriod = {
      _id: { toString: () => 'period-1' },
      periodKey: '2026-05',
      status: 'draft',
    };

    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 20000,
        tokenCreditsLimit: 20000,
        autoRefillEnabled: false,
      }),
    });
    QuotaPeriod.findOne
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(draftPeriod),
        }),
      });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.quota).toBeUndefined();
    expect(response.body.quotaState).toEqual({
      status: 'inactive_period',
      periodId: 'period-1',
      periodKey: '2026-05',
      periodStatus: 'draft',
    });
  });

  it('returns quota derived from an assigned admin plan when available', async () => {
    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 3200,
        tokenCreditsLimit: 8000,
        autoRefillEnabled: false,
      }),
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ adminPlanId: 'plan-1' }),
      }),
    });
    AdminPlan.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ startingCredits: 8000, enabled: true }),
      }),
    });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.quota).toEqual({
      periodTotalCredits: 8000,
      periodUsedCredits: 4800,
      periodRemainingCredits: 3200,
      usageRatio: 0.6,
      resetAt: null,
    });
  });

  it('falls back to global startBalance when no assigned plan is available', async () => {
    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 2000,
        tokenCreditsLimit: 5000,
        autoRefillEnabled: false,
      }),
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ adminPlanId: null }),
      }),
    });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.quota).toEqual({
      periodTotalCredits: 5000,
      periodUsedCredits: 3000,
      periodRemainingCredits: 2000,
      usageRatio: 0.6,
      resetAt: null,
    });
  });

  it('omits quota when no total credit source is available', async () => {
    Balance.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        tokenCredits: 2000,
        tokenCreditsLimit: 0,
        autoRefillEnabled: false,
      }),
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ adminPlanId: null }),
      }),
    });
    getBalanceConfig.mockReturnValue({ enabled: true });

    const response = await request(app).get('/api/balance');

    expect(response.status).toBe(200);
    expect(response.body.quota).toBeUndefined();
  });
});
