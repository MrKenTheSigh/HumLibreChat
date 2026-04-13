const express = require('express');
const request = require('supertest');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((value) => value),
  countTokens: jest.fn().mockResolvedValue(10),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
  getMessage: jest.fn(),
  saveMessage: jest.fn(),
  getMessages: jest.fn(),
  updateMessage: jest.fn(),
  deleteMessages: jest.fn(),
}));

jest.mock('~/models/Transaction', () => ({
  getMessageUsageDetail: jest.fn(),
}));

jest.mock('~/server/services/Artifacts/update', () => ({
  findAllArtifacts: jest.fn(),
  replaceArtifactContent: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  validateMessageReq: (req, res, next) => next(),
}));

jest.mock('~/models/Conversation', () => ({
  getConvosQueried: jest.fn(),
}));

jest.mock('~/db/models', () => ({
  Message: {
    findOne: jest.fn(),
    find: jest.fn(),
    meiliSearch: jest.fn(),
  },
}));

describe('GET /:conversationId/:messageId/usage', () => {
  let app;
  const { getMessage } = require('~/models');
  const { getMessageUsageDetail } = require('~/models/Transaction');
  const authenticatedUserId = 'user-owner-123';

  beforeAll(() => {
    const messagesRouter = require('../messages');

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: authenticatedUserId };
      next();
    });
    app.use('/api/messages', messagesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return usage detail for an owned message', async () => {
    getMessage.mockResolvedValue({
      messageId: 'msg-owned',
      conversationId: 'convo-1',
      user: authenticatedUserId,
    });

    getMessageUsageDetail.mockResolvedValue({
      spentCredits: 320,
      transactions: [
        {
          tokenType: 'prompt',
          context: 'message',
          model: 'gpt-4',
          rawAmount: -100,
          tokenValue: -120,
          rate: 1.2,
          inputTokens: null,
          writeTokens: null,
          readTokens: null,
          createdAt: '2026-04-13T00:00:00.000Z',
        },
      ],
    });

    const response = await request(app).get('/api/messages/convo-1/msg-owned/usage');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      spentCredits: 320,
      transactions: [
        {
          tokenType: 'prompt',
          context: 'message',
          model: 'gpt-4',
          rawAmount: -100,
          tokenValue: -120,
          rate: 1.2,
          inputTokens: null,
          writeTokens: null,
          readTokens: null,
          createdAt: '2026-04-13T00:00:00.000Z',
        },
      ],
    });
    expect(getMessage).toHaveBeenCalledWith({
      user: authenticatedUserId,
      messageId: 'msg-owned',
    });
    expect(getMessageUsageDetail).toHaveBeenCalledWith({
      user: authenticatedUserId,
      messageId: 'msg-owned',
    });
  });

  it('should return 404 when the message is not owned or not found', async () => {
    getMessage.mockResolvedValue(null);

    const response = await request(app).get('/api/messages/convo-1/msg-missing/usage');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Message not found' });
    expect(getMessageUsageDetail).not.toHaveBeenCalled();
  });

  it('should return 404 when conversationId does not match the owned message', async () => {
    getMessage.mockResolvedValue({
      messageId: 'msg-owned',
      conversationId: 'convo-2',
      user: authenticatedUserId,
    });

    const response = await request(app).get('/api/messages/convo-1/msg-owned/usage');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Message not found' });
    expect(getMessageUsageDetail).not.toHaveBeenCalled();
  });

  it('should return 500 when loading usage detail fails', async () => {
    getMessage.mockResolvedValue({
      messageId: 'msg-owned',
      conversationId: 'convo-1',
      user: authenticatedUserId,
    });
    getMessageUsageDetail.mockRejectedValue(new Error('DB failure'));

    const response = await request(app).get('/api/messages/convo-1/msg-owned/usage');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
