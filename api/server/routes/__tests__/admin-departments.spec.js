const mockCreateAdminDepartment = jest.fn((_req, res) =>
  res.status(201).json({ code: 'IT', name: 'Information Technology' }),
);
const mockDisableAdminDepartment = jest.fn((_req, res) =>
  res.status(200).json({ code: 'IT', enabled: false }),
);
const mockGetAdminDepartment = jest.fn((_req, res) =>
  res.status(200).json({ code: 'IT', name: 'Information Technology' }),
);
const mockGetAdminDepartments = jest.fn((_req, res) =>
  res.status(200).json({ departments: [] }),
);
const mockUpdateAdminDepartment = jest.fn((_req, res) =>
  res.status(200).json({ code: 'IT', name: 'IT Ops' }),
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
    createAdminDepartment: (...args) => mockCreateAdminDepartment(...args),
    disableAdminDepartment: (...args) => mockDisableAdminDepartment(...args),
    getAdminDepartment: (...args) => mockGetAdminDepartment(...args),
    getAdminDepartments: (...args) => mockGetAdminDepartments(...args),
    updateAdminDepartment: (...args) => mockUpdateAdminDepartment(...args),
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

describe('Admin Departments Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/departments');
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
    expect(mockGetAdminDepartments).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminDepartments).not.toHaveBeenCalled();
  });

  it('passes through all department routes for admins', async () => {
    const headers = { 'x-auth': 'true', 'x-admin': 'true' };

    await executeRoute({ method: 'GET', url: '/', headers });
    await executeRoute({ method: 'POST', url: '/', headers, body: { code: 'IT' } });
    await executeRoute({ method: 'GET', url: '/department-1', headers });
    await executeRoute({
      method: 'PATCH',
      url: '/department-1',
      headers,
      body: { name: 'IT Ops' },
    });
    await executeRoute({ method: 'DELETE', url: '/department-1', headers });

    expect(mockGetAdminDepartments).toHaveBeenCalledTimes(1);
    expect(mockCreateAdminDepartment).toHaveBeenCalledTimes(1);
    expect(mockGetAdminDepartment).toHaveBeenCalledTimes(1);
    expect(mockUpdateAdminDepartment).toHaveBeenCalledTimes(1);
    expect(mockDisableAdminDepartment).toHaveBeenCalledTimes(1);
  });
});
