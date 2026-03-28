const mockGetAdminTransactions = jest.fn((_req, res) =>
  res.status(200).json({ transactions: [], nextCursor: null }),
);
const mockGetAdminUsageSummary = jest.fn((_req, res) =>
  res.status(200).json({
    transactionCount: 0,
    uniqueUsers: 0,
    totalTokenValue: 0,
    totalRawAmount: 0,
    totalInputTokens: 0,
    totalWriteTokens: 0,
    totalReadTokens: 0,
    newestTransactionAt: null,
    oldestTransactionAt: null,
  }),
);

jest.mock(
  '@librechat/api',
  () => ({
    requireAdmin: (req, res, next) => {
      if (req.headers['x-admin'] === 'true') {
        return next();
      }

      return res.status(403).json({
        error: 'Access denied: Admin privileges required',
        error_code: 'ADMIN_REQUIRED',
      });
    },
    getAdminTransactions: (...args) => mockGetAdminTransactions(...args),
    getAdminUsageSummary: (...args) => mockGetAdminUsageSummary(...args),
  }),
  { virtual: true },
);

jest.mock('~/server/middleware', () => ({
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

describe('Admin Usage Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/usage');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const executeRoute = ({ method, url, headers }) =>
    new Promise((resolve, reject) => {
      const req = { method, url, headers };
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
      };

      router.handle(req, res, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ status: res.statusCode, body: null });
      });
    });

  it('returns 401 when unauthenticated', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(mockGetAdminTransactions).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminTransactions).not.toHaveBeenCalled();
  });

  it('passes through to the summary and transactions handlers for admins', async () => {
    const summaryResponse = await executeRoute({
      method: 'GET',
      url: '/summary',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(summaryResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(mockGetAdminUsageSummary).toHaveBeenCalledTimes(1);
    expect(mockGetAdminTransactions).toHaveBeenCalledTimes(1);
  });
});
