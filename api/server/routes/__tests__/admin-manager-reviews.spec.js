const mockCreateManagerReviewBatch = jest.fn((_req, res) =>
  res.status(201).json({ batch: { id: 'batch-1' } }),
);
const mockGetManagerReviewBatches = jest.fn((_req, res) =>
  res.status(200).json({ batches: [], nextCursor: null }),
);
const mockGetManagerReviewBatchItems = jest.fn((_req, res) =>
  res.status(200).json({ items: [], nextCursor: null }),
);
const mockPreviewManagerReviewBatchEmail = jest.fn((_req, res) =>
  res.status(200).json({ sent: false }),
);
const mockScanOverdueManagerReviewBatches = jest.fn((_req, res) =>
  res.status(200).json({ matchedCount: 1, modifiedCount: 1 }),
);
const mockSendManagerReviewBatchEmail = jest.fn((_req, res) =>
  res.status(200).json({ sent: true }),
);
const mockSendManagerReviewBatchReminderEmail = jest.fn((_req, res) =>
  res.status(200).json({ sent: true }),
);
const mockSubmitManagerReviewBatchResponse = jest.fn((_req, res) =>
  res.status(200).json({ batch: { id: 'batch-1', status: 'reviewed' } }),
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
    createManagerReviewBatch: (...args) => mockCreateManagerReviewBatch(...args),
    getManagerReviewBatches: (...args) => mockGetManagerReviewBatches(...args),
    getManagerReviewBatchItems: (...args) => mockGetManagerReviewBatchItems(...args),
    previewManagerReviewBatchEmail: (...args) => mockPreviewManagerReviewBatchEmail(...args),
    scanOverdueManagerReviewBatches: (...args) =>
      mockScanOverdueManagerReviewBatches(...args),
    sendManagerReviewBatchEmail: (...args) => mockSendManagerReviewBatchEmail(...args),
    sendManagerReviewBatchReminderEmail: (...args) =>
      mockSendManagerReviewBatchReminderEmail(...args),
    submitManagerReviewBatchResponse: (...args) =>
      mockSubmitManagerReviewBatchResponse(...args),
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

describe('Admin Manager Reviews Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../admin/manager-reviews');
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
      method: 'POST',
      url: '/batches',
      headers: {},
      body: {},
    });

    expect(response.status).toBe(401);
    expect(mockCreateManagerReviewBatch).not.toHaveBeenCalled();
  });

  it('passes batch creation through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { managerUserId: 'manager-1' },
    });

    expect(response.status).toBe(201);
    expect(mockCreateManagerReviewBatch).toHaveBeenCalledTimes(1);
  });

  it('passes batch listing through for admins', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/batches',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockGetManagerReviewBatches).toHaveBeenCalledTimes(1);
  });

  it('passes batch item listing through for admins', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/batches/batch-1/items',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockGetManagerReviewBatchItems).toHaveBeenCalledTimes(1);
  });

  it('passes email preview through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/batch-1/email/preview',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockPreviewManagerReviewBatchEmail).toHaveBeenCalledTimes(1);
  });

  it('passes overdue scan through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/overdue/scan',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockScanOverdueManagerReviewBatches).toHaveBeenCalledTimes(1);
  });

  it('passes email send through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/batch-1/email/send',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockSendManagerReviewBatchEmail).toHaveBeenCalledTimes(1);
  });

  it('passes reminder email send through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/batch-1/reminder/email/send',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
    });

    expect(response.status).toBe(200);
    expect(mockSendManagerReviewBatchReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('passes response submission through for admins', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/batch-1/response',
      headers: { 'x-auth': 'true', 'x-admin': 'true' },
      body: { responseStatus: 'ok' },
    });

    expect(response.status).toBe(200);
    expect(mockSubmitManagerReviewBatchResponse).toHaveBeenCalledTimes(1);
  });
});
