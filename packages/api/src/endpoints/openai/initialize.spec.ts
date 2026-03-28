import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams, EndpointTokenConfig } from '~/types';

const mockValidateEndpointURL = jest.fn();
jest.mock('~/auth', () => ({
  validateEndpointURL: (...args: unknown[]) => mockValidateEndpointURL(...args),
}));

const mockGetOpenAIConfig = jest.fn().mockReturnValue({
  llmConfig: { model: 'gpt-4' },
  configOptions: {},
});
jest.mock('./config', () => ({
  getOpenAIConfig: (...args: unknown[]) => mockGetOpenAIConfig(...args),
}));

jest.mock('~/utils', () => ({
  getAzureCredentials: jest.fn(),
  resolveHeaders: jest.fn(() => ({})),
  isUserProvided: (val: string) => val === 'user_provided',
  checkUserKeyExpiry: jest.fn(),
}));

import { initializeOpenAI } from './initialize';

function createParams(
  env: Record<string, string | undefined>,
  overrides?: {
    endpoint?: EModelEndpoint;
    model?: string;
    config?: BaseInitializeParams['req']['config'];
  },
): BaseInitializeParams {
  const savedEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    savedEnv[key] = process.env[key];
  }
  Object.assign(process.env, env);

  const db = {
    getUserKeyValues: jest.fn().mockResolvedValue({
      apiKey: 'sk-user-key',
      baseURL: 'https://user-proxy.example.com/v1',
    }),
  } as unknown as BaseInitializeParams['db'];

  const params: BaseInitializeParams = {
    req: {
      user: { id: 'user-1' },
      body: { key: '2099-01-01' },
      config: overrides?.config ?? { endpoints: {} },
    } as unknown as BaseInitializeParams['req'],
    endpoint: overrides?.endpoint ?? EModelEndpoint.openAI,
    model_parameters: { model: overrides?.model ?? 'gpt-4' },
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

describe('initializeOpenAI – SSRF guard wiring', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call validateEndpointURL when OPENAI_REVERSE_PROXY is user_provided', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: AuthType.USER_PROVIDED,
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).toHaveBeenCalledTimes(1);
    expect(mockValidateEndpointURL).toHaveBeenCalledWith(
      'https://user-proxy.example.com/v1',
      EModelEndpoint.openAI,
    );
  });

  it('should NOT call validateEndpointURL when OPENAI_REVERSE_PROXY is a system URL', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: 'https://api.openai.com/v1',
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
  });

  it('should NOT call validateEndpointURL when baseURL is falsy', async () => {
    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
    });

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockValidateEndpointURL).not.toHaveBeenCalled();
  });

  it('should propagate SSRF rejection from validateEndpointURL', async () => {
    mockValidateEndpointURL.mockRejectedValueOnce(
      new Error('Base URL for openAI targets a restricted address.'),
    );

    const params = createParams({
      OPENAI_API_KEY: 'sk-test',
      OPENAI_REVERSE_PROXY: AuthType.USER_PROVIDED,
    });

    try {
      await expect(initializeOpenAI(params)).rejects.toThrow('targets a restricted address');
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect(mockGetOpenAIConfig).not.toHaveBeenCalled();
  });

  it('attaches azure group tokenConfig when managed azure pricing overrides are present', async () => {
    const tokenConfig: EndpointTokenConfig = {
      'gpt-4o': {
        prompt: 9,
        completion: 18,
        context: 120000,
      },
    };

    const params = createParams(
      {
        AZURE_API_KEY: 'sk-azure',
      },
      {
        endpoint: EModelEndpoint.azureOpenAI,
        model: 'gpt-4o',
        config: {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              modelGroupMap: {
                'gpt-4o': { group: 'managed-azure' },
              },
              groupMap: {
                'managed-azure': {
                  apiKey: 'sk-managed-azure',
                  instanceName: 'managed-instance',
                  version: '2025-01-01-preview',
                  tokenConfig,
                  models: {
                    'gpt-4o': {
                      deploymentName: 'gpt-4o',
                    },
                  },
                },
              },
            },
          },
        } as BaseInitializeParams['req']['config'],
      },
    );

    try {
      const result = await initializeOpenAI(params);
      expect(result.endpointTokenConfig).toEqual(tokenConfig);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }
  });

  it('prefers managed OpenAI API keys over legacy user_provided env mode', async () => {
    const params = createParams(
      {
        OPENAI_API_KEY: AuthType.USER_PROVIDED,
      },
      {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4o',
        config: {
          endpoints: {
            [EModelEndpoint.openAI]: {
              apiKey: 'managed-openai-key',
              baseURL: 'https://managed-openai.example.com/v1',
            },
          },
        } as BaseInitializeParams['req']['config'],
      },
    );

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect((params.db as unknown as { getUserKeyValues: jest.Mock }).getUserKeyValues).not.toHaveBeenCalled();
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'managed-openai-key',
      expect.objectContaining({
        reverseProxyUrl: 'https://managed-openai.example.com/v1',
      }),
      EModelEndpoint.openAI,
    );
  });

  it('prefers managed Azure config over legacy user_provided env mode', async () => {
    const params = createParams(
      {
        AZURE_API_KEY: AuthType.USER_PROVIDED,
      },
      {
        endpoint: EModelEndpoint.azureOpenAI,
        model: 'gpt-4o',
        config: {
          endpoints: {
            [EModelEndpoint.azureOpenAI]: {
              modelGroupMap: {
                'gpt-4o': { group: 'managed-azure' },
              },
              groupMap: {
                'managed-azure': {
                  apiKey: 'managed-azure-key',
                  instanceName: 'managed-instance',
                  version: '2025-01-01-preview',
                  models: {
                    'gpt-4o': {
                      deploymentName: 'gpt-4o',
                    },
                  },
                },
              },
            },
          },
        } as BaseInitializeParams['req']['config'],
      },
    );

    try {
      await initializeOpenAI(params);
    } finally {
      (params as unknown as { _restore: () => void })._restore();
    }

    expect((params.db as unknown as { getUserKeyValues: jest.Mock }).getUserKeyValues).not.toHaveBeenCalled();
    expect(mockGetOpenAIConfig).toHaveBeenCalledWith(
      'managed-azure-key',
      expect.objectContaining({ azure: expect.any(Object) }),
      EModelEndpoint.azureOpenAI,
    );
  });
});
