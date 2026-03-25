const mockGetAdminUsers = jest.fn((_req, res) =>
  res.status(200).json({ users: [], nextCursor: null }),
);
const mockGetAdminUser = jest.fn((_req, res) => res.status(200).json({ id: 'user-1' }));
const mockAddAdminUserBalance = jest.fn((_req, res) =>
  res.status(200).json({ userId: 'user-1', tokenCredits: 100, updatedAt: null }),
);
const mockSetAdminUserBalance = jest.fn((_req, res) =>
  res.status(200).json({ userId: 'user-1', tokenCredits: 50, updatedAt: null }),
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
    getAdminUsers: (...args) => mockGetAdminUsers(...args),
    getAdminUser: (...args) => mockGetAdminUser(...args),
    addAdminUserBalance: (...args) => mockAddAdminUserBalance(...args),
    setAdminUserBalance: (...args) => mockSetAdminUserBalance(...args),
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

describe('Admin Users Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/users');
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
      url: '/',
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(mockGetAdminUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminUsers).not.toHaveBeenCalled();
  });

  it('passes through to the list handler for admins', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockGetAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('passes through to detail and balance handlers for admins', async () => {
    await executeRoute({
      method: 'GET',
      url: '/user-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'POST',
      url: '/user-1/balance/add',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { amount: 25 },
    });
    await executeRoute({
      method: 'POST',
      url: '/user-1/balance/set',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { amount: 10 },
    });

    expect(mockGetAdminUser).toHaveBeenCalledTimes(1);
    expect(mockAddAdminUserBalance).toHaveBeenCalledTimes(1);
    expect(mockSetAdminUserBalance).toHaveBeenCalledTimes(1);
  });
});
