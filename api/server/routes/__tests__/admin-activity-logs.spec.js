const mockGetAdminActivityLogs = jest.fn((_req, res) =>
  res.status(200).json({ events: [], nextCursor: null }),
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
    getAdminActivityLogs: (...args) => mockGetAdminActivityLogs(...args),
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

describe('Admin Activity Log Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/activity-logs');
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
      url: '/',
      headers: {},
    });

    expect(response.status).toBe(401);
    expect(mockGetAdminActivityLogs).not.toHaveBeenCalled();
  });

  it('returns 403 without admin data access', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminActivityLogs).not.toHaveBeenCalled();
  });

  it('passes through activity log list requests for admin data roles', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin-data': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockGetAdminActivityLogs).toHaveBeenCalledTimes(1);
  });
});
