import { AuthKeys, EModelEndpoint } from 'librechat-data-provider';
import type { BaseInitializeParams } from '~/types';

const mockGetLLMConfig = jest.fn().mockReturnValue({
  provider: 'anthropic',
  llmConfig: { model: 'claude-sonnet-4' },
});
const mockLoadAnthropicVertexCredentials = jest.fn();
const mockGetVertexCredentialOptions = jest.fn();

jest.mock('./llm', () => ({
  getLLMConfig: (...args: unknown[]) => mockGetLLMConfig(...args),
}));

jest.mock('./vertex', () => ({
  loadAnthropicVertexCredentials: (...args: unknown[]) =>
    mockLoadAnthropicVertexCredentials(...args),
  getVertexCredentialOptions: (...args: unknown[]) => mockGetVertexCredentialOptions(...args),
}));

jest.mock('~/utils', () => ({
  checkUserKeyExpiry: jest.fn(),
  isEnabled: (value: unknown) => value === 'true',
}));

import { initializeAnthropic } from './initialize';

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
    getUserKey: jest.fn().mockResolvedValue('user-anthropic-key'),
  } as unknown as BaseInitializeParams['db'];

  const params: BaseInitializeParams = {
    req: {
      user: { id: 'user-1' },
      body: { key: '2099-01-01' },
      config: config ?? { endpoints: {} },
    } as BaseInitializeParams['req'],
    endpoint: EModelEndpoint.anthropic,
    model_parameters: { model: 'claude-sonnet-4' },
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

describe('initializeAnthropic', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prefers managed Anthropic API keys over legacy user_provided and vertex env flags', async () => {
    const params = createParams(
      {
        ANTHROPIC_API_KEY: 'user_provided',
        ANTHROPIC_USE_VERTEX: 'true',
      },
      {
        endpoints: {
          [EModelEndpoint.anthropic]: {
            apiKey: 'managed-anthropic-key',
            baseURL: 'https://managed-anthropic.example.com',
          },
        },
      } as BaseInitializeParams['req']['config'],
    );

    try {
      await initializeAnthropic(params);
    } finally {
      (params as BaseInitializeParams & { _restore: () => void })._restore();
    }

    expect((params.db as unknown as { getUserKey: jest.Mock }).getUserKey).not.toHaveBeenCalled();
    expect(mockLoadAnthropicVertexCredentials).not.toHaveBeenCalled();
    expect(mockGetLLMConfig).toHaveBeenCalledWith(
      {
        [AuthKeys.ANTHROPIC_API_KEY]: 'managed-anthropic-key',
      },
      expect.objectContaining({
        reverseProxyUrl: 'https://managed-anthropic.example.com',
      }),
    );
  });
});
