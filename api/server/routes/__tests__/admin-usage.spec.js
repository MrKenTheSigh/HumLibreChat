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
const mockGetAdminUsageMembers = jest.fn((_req, res) =>
  res.status(200).json({ members: [], nextCursor: null }),
);
const mockExportAdminTransactionsCsv = jest.fn((_req, res) =>
  res.status(200).send('transactions csv'),
);
const mockExportAdminUsageMembersCsv = jest.fn((_req, res) =>
  res.status(200).send('members csv'),
);
const mockGetAdminTransactionsExportCount = jest.fn((_req, res) =>
  res.status(200).json({ count: 1, limit: 10000 }),
);
const mockGetAdminUsageMembersExportCount = jest.fn((_req, res) =>
  res.status(200).json({ count: 1, limit: 10000 }),
);

jest.mock(
  '@librechat/api',
  () => ({
    requireAdminDataAccess: (req, res, next) => {
      if (req.headers['x-admin-data'] === 'true') {
        return next();
      }

      return res.status(403).json({
        error: 'Access denied: Admin data access role required',
        error_code: 'ADMIN_DATA_ACCESS_REQUIRED',
      });
    },
    exportAdminTransactionsCsv: (...args) => mockExportAdminTransactionsCsv(...args),
    exportAdminUsageMembersCsv: (...args) => mockExportAdminUsageMembersCsv(...args),
    getAdminTransactionsExportCount: (...args) => mockGetAdminTransactionsExportCount(...args),
    getAdminTransactions: (...args) => mockGetAdminTransactions(...args),
    getAdminUsageMembers: (...args) => mockGetAdminUsageMembers(...args),
    getAdminUsageMembersExportCount: (...args) => mockGetAdminUsageMembersExportCount(...args),
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

  it('returns 401 when unauthenticated', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(mockGetAdminTransactions).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated users without admin data access', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminTransactions).not.toHaveBeenCalled();
  });

  it('passes through to the summary, members, and transactions handlers for admins', async () => {
    const summaryResponse = await executeRoute({
      method: 'GET',
      url: '/summary',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });
    const membersResponse = await executeRoute({
      method: 'GET',
      url: '/members',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });
    const response = await executeRoute({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });

    expect(summaryResponse.status).toBe(200);
    expect(membersResponse.status).toBe(200);
    expect(response.status).toBe(200);
    expect(mockGetAdminUsageSummary).toHaveBeenCalledTimes(1);
    expect(mockGetAdminUsageMembers).toHaveBeenCalledTimes(1);
    expect(mockGetAdminTransactions).toHaveBeenCalledTimes(1);
  });

  it('passes through to the export handlers for admins', async () => {
    const membersCountResponse = await executeRoute({
      method: 'GET',
      url: '/members/export/count',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });
    const membersExportResponse = await executeRoute({
      method: 'GET',
      url: '/members/export',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });
    const transactionsCountResponse = await executeRoute({
      method: 'GET',
      url: '/transactions/export/count',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });
    const transactionsExportResponse = await executeRoute({
      method: 'GET',
      url: '/transactions/export',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });

    expect(membersCountResponse.status).toBe(200);
    expect(membersExportResponse.status).toBe(200);
    expect(transactionsCountResponse.status).toBe(200);
    expect(transactionsExportResponse.status).toBe(200);
    expect(mockGetAdminUsageMembersExportCount).toHaveBeenCalledTimes(1);
    expect(mockExportAdminUsageMembersCsv).toHaveBeenCalledTimes(1);
    expect(mockGetAdminTransactionsExportCount).toHaveBeenCalledTimes(1);
    expect(mockExportAdminTransactionsCsv).toHaveBeenCalledTimes(1);
  });
});
