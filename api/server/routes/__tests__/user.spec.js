const mockGetUserEntitlements = jest.fn((_req, res) =>
  res.status(200).json({
    scope: 'assigned_plan',
    isRestricted: true,
    plan: { id: 'plan-1', name: 'Pro', slug: 'pro' },
    allowedChannels: [],
    allowedPairs: [],
  }),
);

jest.mock(
  '@librechat/api',
  () => ({
    getUserEntitlements: (...args) => mockGetUserEntitlements(...args),
  }),
  { virtual: true },
);

jest.mock('~/server/controllers/UserController', () => ({
  updateUserPluginsController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  resendVerificationController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  getTermsStatusController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  acceptTermsController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  verifyEmailController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  deleteUserController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
  getUserController: jest.fn((_req, res) => res.status(200).json({ ok: true })),
}));

jest.mock('~/server/middleware', () => ({
  verifyEmailLimiter: (_req, _res, next) => next(),
  configMiddleware: (_req, _res, next) => next(),
  canDeleteAccount: (_req, _res, next) => next(),
  requireJwtAuth: (req, res, next) => {
    if (req.headers['x-auth'] === 'true') {
      return next();
    }

    return res.status(401).json({
      error: 'Authentication required',
      error_code: 'AUTHENTICATION_REQUIRED',
    });
  },
}));

jest.mock('../settings', () => {
  const express = require('express');
  return express.Router();
});

describe('User Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../user');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const executeRoute = ({ method, url, headers, body }) =>
    new Promise((resolve, reject) => {
      const req = { method, url, headers, body };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          resolve({ status: this.statusCode, body: payload });
          return this;
        },
        send(payload) {
          resolve({ status: this.statusCode, body: payload });
          return this;
        },
      };

      router.handle(req, res, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ status: res.statusCode, body: null });
      });
    });

  it('returns 401 for unauthenticated entitlement requests', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/entitlements',
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(mockGetUserEntitlements).not.toHaveBeenCalled();
  });

  it('passes entitlement requests to the handler when authenticated', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/entitlements',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      scope: 'assigned_plan',
      isRestricted: true,
      plan: { id: 'plan-1', name: 'Pro', slug: 'pro' },
      allowedChannels: [],
      allowedPairs: [],
    });
    expect(mockGetUserEntitlements).toHaveBeenCalledTimes(1);
  });
});
