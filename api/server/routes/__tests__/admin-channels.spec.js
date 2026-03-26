const mockHandlers = {
  getAdminChannels: jest.fn((_req, res) => res.status(200).json({ channels: [] })),
  getAdminChannel: jest.fn((_req, res) => res.status(200).json({ id: 'channel-1' })),
  createAdminChannel: jest.fn((_req, res) => res.status(201).json({ id: 'channel-1' })),
  updateAdminChannel: jest.fn((_req, res) => res.status(200).json({ id: 'channel-1' })),
  deleteAdminChannel: jest.fn((_req, res) =>
    res.status(200).json({ id: 'channel-1', deleted: true }),
  ),
};

const mockCreateAdminChannelsHandlers = jest.fn(() => mockHandlers);

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
    createAdminChannelsHandlers: (...args) => mockCreateAdminChannelsHandlers(...args),
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

describe('Admin Channels Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/channels');
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
    expect(mockHandlers.getAdminChannels).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockHandlers.getAdminChannels).not.toHaveBeenCalled();
  });

  it('passes through to all channel handlers for admins', async () => {
    await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'GET',
      url: '/channel-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'POST',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { name: 'Azure Premium', slug: 'azure-premium' },
    });
    await executeRoute({
      method: 'PATCH',
      url: '/channel-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { name: 'Azure Premium', slug: 'azure-premium' },
    });
    await executeRoute({
      method: 'DELETE',
      url: '/channel-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(mockHandlers.getAdminChannels).toHaveBeenCalledTimes(1);
    expect(mockHandlers.getAdminChannel).toHaveBeenCalledTimes(1);
    expect(mockHandlers.createAdminChannel).toHaveBeenCalledTimes(1);
    expect(mockHandlers.updateAdminChannel).toHaveBeenCalledTimes(1);
    expect(mockHandlers.deleteAdminChannel).toHaveBeenCalledTimes(1);
  });
});
