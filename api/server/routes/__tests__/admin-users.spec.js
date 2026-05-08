const mockGetAdminUsers = jest.fn((_req, res) =>
  res.status(200).json({ users: [], nextCursor: null }),
);
const mockCreateAdminUser = jest.fn((_req, res) =>
  res.status(201).json({ id: 'user-2', email: 'new@example.com' }),
);
const mockGetAdminUser = jest.fn((_req, res) => res.status(200).json({ id: 'user-1' }));
const mockUpdateAdminUser = jest.fn((_req, res) =>
  res.status(200).json({ id: 'user-1', name: 'Updated User' }),
);
const mockAddAdminUserBalance = jest.fn((_req, res) =>
  res.status(200).json({ userId: 'user-1', tokenCredits: 100, updatedAt: null }),
);
const mockUpdateAdminUserRole = jest.fn((_req, res) =>
  res.status(200).json({ userId: 'user-1', role: 'MEMBER' }),
);
const mockUpdateAdminUserDepartment = jest.fn((_req, res) =>
  res.status(200).json({
    userId: 'user-1',
    department: { id: 'department-1', code: 'IT', name: 'Information Technology' },
    departmentAssignedAt: '2026-04-21T00:00:00.000Z',
  }),
);
const mockAssignAdminUserPlan = jest.fn((_req, res) =>
  res.status(200).json({
    userId: 'user-1',
    plan: { id: 'plan-1', name: 'Pro', slug: 'pro' },
    assignedAt: '2026-03-26T03:00:00.000Z',
  }),
);
const mockApplyAdminUserPlanStartingCredits = jest.fn((_req, res) =>
  res.status(200).json({
    applied: true,
    reason: 'applied',
    tokenCredits: 5000,
    provisioning: {
      balanceEnabled: true,
      hasBalanceRecord: true,
      currentPlanStartingCredits: 5000,
      appliedAt: '2026-03-26T03:00:00.000Z',
      appliedPlanId: 'plan-1',
      appliedAmount: 5000,
      appliedSource: 'admin_manual_apply',
      appliedPlanMatchesCurrent: true,
      canApplyStartingCredits: false,
    },
  }),
);
const mockClearAdminUserPlan = jest.fn((_req, res) =>
  res.status(200).json({ userId: 'user-1', plan: null, assignedAt: null }),
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
    createAdminUser: (...args) => mockCreateAdminUser(...args),
    getAdminUsers: (...args) => mockGetAdminUsers(...args),
    getAdminUser: (...args) => mockGetAdminUser(...args),
    updateAdminUser: (...args) => mockUpdateAdminUser(...args),
    addAdminUserBalance: (...args) => mockAddAdminUserBalance(...args),
    updateAdminUserRole: (...args) => mockUpdateAdminUserRole(...args),
    updateAdminUserDepartment: (...args) => mockUpdateAdminUserDepartment(...args),
    applyAdminUserPlanStartingCredits: (...args) => mockApplyAdminUserPlanStartingCredits(...args),
    assignAdminUserPlan: (...args) => mockAssignAdminUserPlan(...args),
    clearAdminUserPlan: (...args) => mockClearAdminUserPlan(...args),
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
  configMiddleware: (_req, _res, next) => next(),
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

  it('passes through to create, detail, balance, and plan handlers for admins', async () => {
    await executeRoute({
      method: 'POST',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { email: 'new@example.com' },
    });
    await executeRoute({
      method: 'GET',
      url: '/user-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'PATCH',
      url: '/user-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { name: 'Updated User' },
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
    await executeRoute({
      method: 'POST',
      url: '/user-1/role',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { roleName: 'MEMBER' },
    });
    await executeRoute({
      method: 'POST',
      url: '/user-1/department',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { departmentId: 'department-1' },
    });
    await executeRoute({
      method: 'POST',
      url: '/user-1/plan',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { planId: 'plan-1' },
    });
    await executeRoute({
      method: 'POST',
      url: '/user-1/plan/apply-starting-credits',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'DELETE',
      url: '/user-1/plan',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(mockCreateAdminUser).toHaveBeenCalledTimes(1);
    expect(mockGetAdminUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateAdminUser).toHaveBeenCalledTimes(1);
    expect(mockAddAdminUserBalance).toHaveBeenCalledTimes(1);
    expect(mockSetAdminUserBalance).toHaveBeenCalledTimes(1);
    expect(mockUpdateAdminUserRole).toHaveBeenCalledTimes(1);
    expect(mockUpdateAdminUserDepartment).toHaveBeenCalledTimes(1);
    expect(mockAssignAdminUserPlan).toHaveBeenCalledTimes(1);
    expect(mockApplyAdminUserPlanStartingCredits).toHaveBeenCalledTimes(1);
    expect(mockClearAdminUserPlan).toHaveBeenCalledTimes(1);
  });
});
