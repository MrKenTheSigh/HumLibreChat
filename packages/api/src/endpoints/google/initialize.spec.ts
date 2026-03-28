import { AuthKeys, AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockGetGoogleConfig = jest.fn().mockReturnValue({
  provider: 'google',
  llmConfig: { model: 'gemini-2.5-flash' },
});

jest.mock('./llm', () => ({
  getGoogleConfig: (...args: unknown[]) => mockGetGoogleConfig(...args),
}));

jest.mock('~/utils', () => ({
  isEnabled: jest.fn(() => undefined),
  loadServiceKey: jest.fn(),
  checkUserKeyExpiry: jest.fn(),
}));

import { initializeGoogle } from './initialize';

function createParams(
  env: Record<string, string | undefined>,
  config?: BaseInitializeParams['req']['config'],
): BaseInitializeParams {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    savedEnv[key] = process.env[key];
  }
  Object.assign(process.env, env);

  const db = {
    getUserKey: jest.fn().mockResolvedValue({
      [AuthKeys.GOOGLE_API_KEY]: 'user-google-key',
    }),
  } as unknown as BaseInitializeParams['db'];

  const params: BaseInitializeParams = {
    req: {
      user: { id: 'user-1' },
      body: { key: '2099-01-01' },
      config: config ?? { endpoints: {} },
    } as BaseInitializeParams['req'],
    endpoint: EModelEndpoint.google,
    model_parameters: { model: 'gemini-2.5-flash' },
    db,
  };

  const restore = () => {
    for (const key of Object.keys(env)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  };

  return Object.assign(params, { _restore: restore });
}

describe('initializeGoogle', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prefers managed channel API keys over legacy user_provided env mode', async () => {
    const params = createParams(
      {
        GOOGLE_KEY: AuthType.USER_PROVIDED,
      },
      {
        endpoints: {
          [EModelEndpoint.google]: {
            apiKey: 'managed-google-key',
            baseURL: 'https://generativelanguage.googleapis.com',
          },
        },
      } as BaseInitializeParams['req']['config'],
    );

    try {
      await initializeGoogle(params);
    } finally {
      (params as BaseInitializeParams & { _restore: () => void })._restore();
    }

    expect(mockGetGoogleConfig).toHaveBeenCalledWith(
      {
        [AuthKeys.GOOGLE_SERVICE_KEY]: {},
        [AuthKeys.GOOGLE_API_KEY]: 'managed-google-key',
      },
      expect.objectContaining({
        reverseProxyUrl: 'https://generativelanguage.googleapis.com',
      }),
    );
    expect((params.db as unknown as { getUserKey: jest.Mock }).getUserKey).not.toHaveBeenCalled();
  });
});
