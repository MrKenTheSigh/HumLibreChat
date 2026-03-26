import { ViolationTypes } from 'librechat-data-provider';
import type { Agent, TModelsConfig } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const mockIsPairAllowed = jest.fn();
const mockResolveUserEntitlements = jest.fn();

jest.mock('~/admin/access', () => ({
  isPairAllowed: (...args: unknown[]) => mockIsPairAllowed(...args),
  resolveUserEntitlements: (...args: unknown[]) => mockResolveUserEntitlements(...args),
}));

const { validateAgentModel } = require('./validation');

describe('validateAgentModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createParams(overrides?: {
    agent?: Partial<Agent>;
    modelsConfig?: TModelsConfig;
  }) {
    const req = {
      user: {
        _id: 'user-1',
        role: 'USER',
      },
    } as Request;
    const res = {} as Response;
    const logViolation = jest.fn().mockResolvedValue(undefined);

    return {
      req,
      res,
      logViolation,
      agent: {
        provider: 'azureOpenAI',
        model: 'gpt-4o-mini',
        ...(overrides?.agent ?? {}),
      } as Agent,
      modelsConfig: {
        azureOpenAI: ['gpt-4o-mini', 'gpt-4o'],
        ...(overrides?.modelsConfig ?? {}),
      },
    };
  }

  it('returns valid when the model exists and is allowed by entitlements', async () => {
    mockResolveUserEntitlements.mockResolvedValue({
      isRestricted: true,
      allowedPairs: [],
    });
    mockIsPairAllowed.mockReturnValue(true);

    const result = await validateAgentModel(createParams());

    expect(result).toEqual({ isValid: true });
  });

  it('returns plan forbidden when the model exists but is blocked by entitlements', async () => {
    mockResolveUserEntitlements.mockResolvedValue({
      isRestricted: true,
      allowedPairs: [],
    });
    mockIsPairAllowed.mockReturnValue(false);

    const result = await validateAgentModel(createParams());

    expect(result).toEqual({
      isValid: false,
      error: {
        message: '{ "type": "PLAN_MODEL_FORBIDDEN", "info": "azureOpenAI|gpt-4o-mini" }',
      },
    });
  });

  it('preserves illegal model handling when the model is not present in modelsConfig', async () => {
    const params = createParams({
      agent: {
        provider: 'azureOpenAI',
        model: 'unknown-model',
      },
    });

    const result = await validateAgentModel(params);

    expect(params.logViolation).toHaveBeenCalledWith(
      params.req,
      params.res,
      ViolationTypes.ILLEGAL_MODEL_REQUEST,
      {
        type: ViolationTypes.ILLEGAL_MODEL_REQUEST,
        model: 'unknown-model',
        endpoint: 'azureOpenAI',
      },
      1,
    );
    expect(mockResolveUserEntitlements).not.toHaveBeenCalled();
    expect(result).toEqual({
      isValid: false,
      error: {
        message: '{ "type": "illegal_model_request", "info": "azureOpenAI|unknown-model" }',
      },
    });
  });
});
