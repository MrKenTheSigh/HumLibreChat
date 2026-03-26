const mockCreateGetAdminChannelInventory = jest.fn(() => mockInventoryHandler);
const mockInventoryHandler = jest.fn((_req, res) =>
  res.status(200).json({ inventory: [] }),
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
    createGetAdminChannelInventory: (...args) => mockCreateGetAdminChannelInventory(...args),
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

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  getEndpointsConfig: jest.fn(),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn(),
}));

describe('Admin Channel Inventory Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/channelInventory');
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
    expect(mockInventoryHandler).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockInventoryHandler).not.toHaveBeenCalled();
  });

  it('passes through to the inventory handler for admins', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockInventoryHandler).toHaveBeenCalledTimes(1);
  });
});
