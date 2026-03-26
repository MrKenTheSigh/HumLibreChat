const mockCreateAdminPlan = jest.fn((_req, res) =>
  res.status(201).json({ id: 'plan-1', slug: 'pro' }),
);
const mockDeleteAdminPlan = jest.fn((_req, res) =>
  res.status(200).json({ id: 'plan-1', deleted: true }),
);
const mockGetAdminPlan = jest.fn((_req, res) => res.status(200).json({ id: 'plan-1' }));
const mockGetAdminPlans = jest.fn((_req, res) => res.status(200).json({ plans: [] }));
const mockUpdateAdminPlan = jest.fn((_req, res) =>
  res.status(200).json({ id: 'plan-1', slug: 'pro' }),
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
    createAdminPlan: (...args) => mockCreateAdminPlan(...args),
    deleteAdminPlan: (...args) => mockDeleteAdminPlan(...args),
    getAdminPlan: (...args) => mockGetAdminPlan(...args),
    getAdminPlans: (...args) => mockGetAdminPlans(...args),
    updateAdminPlan: (...args) => mockUpdateAdminPlan(...args),
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

describe('Admin Plans Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/plans');
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
    expect(mockGetAdminPlans).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminPlans).not.toHaveBeenCalled();
  });

  it('passes through to all plan handlers for admins', async () => {
    await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'GET',
      url: '/plan-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'POST',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { name: 'Pro', slug: 'pro' },
    });
    await executeRoute({
      method: 'PATCH',
      url: '/plan-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { name: 'Pro', slug: 'pro' },
    });
    await executeRoute({
      method: 'DELETE',
      url: '/plan-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(mockGetAdminPlans).toHaveBeenCalledTimes(1);
    expect(mockGetAdminPlan).toHaveBeenCalledTimes(1);
    expect(mockCreateAdminPlan).toHaveBeenCalledTimes(1);
    expect(mockUpdateAdminPlan).toHaveBeenCalledTimes(1);
    expect(mockDeleteAdminPlan).toHaveBeenCalledTimes(1);
  });
});
