const mockGetManagerReviewBatchByToken = jest.fn((_req, res) =>
  res.status(200).json({ batch: { id: 'batch-1' } }),
);
const mockGetManagerReviewBatchItemsByToken = jest.fn((_req, res) =>
  res.status(200).json({ items: [], nextCursor: null }),
);
const mockSubmitManagerReviewBatchResponseByToken = jest.fn((_req, res) =>
  res.status(200).json({ batch: { id: 'batch-1', status: 'reviewed' } }),
);

jest.mock(
  '@librechat/api',
  () => ({
    getManagerReviewBatchByToken: (...args) => mockGetManagerReviewBatchByToken(...args),
    getManagerReviewBatchItemsByToken: (...args) =>
      mockGetManagerReviewBatchItemsByToken(...args),
    submitManagerReviewBatchResponseByToken: (...args) =>
      mockSubmitManagerReviewBatchResponseByToken(...args),
  }),
  { virtual: true },
);

describe('Manager Reviews Routes', () => {
  let router;

  beforeAll(() => {
    router = require('../manager-reviews');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const executeRoute = ({ method, url, headers = {}, body }) =>
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

  it('passes token batch lookup through without admin auth middleware', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/batches/batch-1?token=token-1',
    });

    expect(response.status).toBe(200);
    expect(mockGetManagerReviewBatchByToken).toHaveBeenCalledTimes(1);
  });

  it('passes token batch item lookup through without admin auth middleware', async () => {
    const response = await executeRoute({
      method: 'GET',
      url: '/batches/batch-1/items?token=token-1',
    });

    expect(response.status).toBe(200);
    expect(mockGetManagerReviewBatchItemsByToken).toHaveBeenCalledTimes(1);
  });

  it('passes token response submission through without admin auth middleware', async () => {
    const response = await executeRoute({
      method: 'POST',
      url: '/batches/batch-1/response?token=token-1',
      body: { responseStatus: 'ok' },
    });

    expect(response.status).toBe(200);
    expect(mockSubmitManagerReviewBatchResponseByToken).toHaveBeenCalledTimes(1);
  });
});
