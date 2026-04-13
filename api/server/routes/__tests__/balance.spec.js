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
  const { Balance, User, AdminPlan } = require('~/db/models');

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
