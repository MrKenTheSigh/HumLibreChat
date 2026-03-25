const mockGetAdminConversations = jest.fn((_req, res) =>
  res.status(200).json({ conversations: [], nextCursor: null }),
);
const mockGetAdminConversation = jest.fn((_req, res) =>
  res.status(200).json({ conversationId: 'convo-1' }),
);
const mockGetAdminConversationMessages = jest.fn((_req, res) =>
  res.status(200).json({ conversation: { conversationId: 'convo-1' }, messages: [] }),
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
    getAdminConversations: (...args) => mockGetAdminConversations(...args),
    getAdminConversation: (...args) => mockGetAdminConversation(...args),
    getAdminConversationMessages: (...args) => mockGetAdminConversationMessages(...args),
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

describe('Admin Conversations Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/conversations');
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
    expect(mockGetAdminConversations).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true' },
    });

    expect(response.status).toBe(403);
    expect(mockGetAdminConversations).not.toHaveBeenCalled();
  });

  it('passes through to list, detail, and message handlers for admins', async () => {
    await executeRoute({
      method: 'GET',
      url: '/',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'GET',
      url: '/convo-1',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });
    await executeRoute({
      method: 'GET',
      url: '/convo-1/messages',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(mockGetAdminConversations).toHaveBeenCalledTimes(1);
    expect(mockGetAdminConversation).toHaveBeenCalledTimes(1);
    expect(mockGetAdminConversationMessages).toHaveBeenCalledTimes(1);
  });
});
