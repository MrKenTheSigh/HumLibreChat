const mockHandleError = jest.fn();
const mockIsPairAllowed = jest.fn();
const mockResolveUserEntitlements = jest.fn();
const mockGetModelsConfig = jest.fn();
const mockLogViolation = jest.fn();

jest.mock('@librechat/api', () => ({
  handleError: (...args) => mockHandleError(...args),
  resolveUserEntitlements: (...args) => mockResolveUserEntitlements(...args),
  isPairAllowed: (...args) => mockIsPairAllowed(...args),
}), { virtual: true });

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: (...args) => mockGetModelsConfig(...args),
}));

jest.mock('~/cache', () => ({
  logViolation: (...args) => mockLogViolation(...args),
}));

const validateModel = require('./validateModel');

describe('validateModel middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleError.mockImplementation((res, { text }) => res.status(400).json({ message: text }));
  });

  function createResponse() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  it('calls next when the model is valid and allowed by plan access', async () => {
    const req = {
      body: {
        endpoint: 'azureOpenAI',
        model: 'gpt-4o-mini',
      },
      user: {
        id: 'user-1',
        role: 'USER',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    mockGetModelsConfig.mockResolvedValue({
      azureOpenAI: ['gpt-4o-mini'],
    });
    mockResolveUserEntitlements.mockResolvedValue({
      isRestricted: true,
      allowedPairs: [],
    });
    mockIsPairAllowed.mockReturnValue(true);

    await validateModel(req, res, next);

    expect(mockResolveUserEntitlements).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'USER',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('returns 403 when the model is blocked by plan access', async () => {
    const req = {
      body: {
        endpoint: 'azureOpenAI',
        model: 'gpt-4o',
      },
      user: {
        id: 'user-1',
        role: 'USER',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    mockGetModelsConfig.mockResolvedValue({
      azureOpenAI: ['gpt-4o'],
    });
    mockResolveUserEntitlements.mockResolvedValue({
      isRestricted: true,
      allowedPairs: [],
    });
    mockIsPairAllowed.mockReturnValue(false);

    await validateModel(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Model is not allowed for the current plan',
      error_code: 'PLAN_MODEL_FORBIDDEN',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves the existing illegal model path for models missing from config', async () => {
    const req = {
      body: {
        endpoint: 'azureOpenAI',
        model: 'gpt-4o',
      },
      user: {
        id: 'user-1',
        role: 'USER',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    mockGetModelsConfig.mockResolvedValue({
      azureOpenAI: ['gpt-4o-mini'],
    });

    await validateModel(req, res, next);

    expect(mockLogViolation).toHaveBeenCalledTimes(1);
    expect(mockHandleError).toHaveBeenCalledWith(res, { text: 'Illegal model request' });
    expect(mockResolveUserEntitlements).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
