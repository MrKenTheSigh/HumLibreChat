import type { Request, Response } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { TEndpointsConfig, TModelsConfig } from 'librechat-data-provider';

const mockLoggerError = jest.fn();
const mockFetchModels = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: mockLoggerError,
  },
  createModels: jest.fn(() => ({})),
  createMethods: jest.fn(() => ({})),
}));

jest.mock('~/endpoints/models', () => ({
  fetchModels: (...args: unknown[]) => mockFetchModels(...args),
}));

const {
  buildAdminChannelInventory,
  createGetAdminChannelInventory,
  filterModelsConfigToUsableEntries,
} = require('./channelInventory');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

describe('admin channel inventory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('buildAdminChannelInventory', () => {
    it('returns a normalized sorted inventory limited to configured endpoints', () => {
      const endpointsConfig: TEndpointsConfig = {
        azureOpenAI: { order: 1 },
        openAI: { order: 2 },
      };
      const modelsConfig: TModelsConfig = {
        openAI: ['gpt-4o-mini', 'gpt-4o'],
        azureOpenAI: ['gpt-4o', 'gpt-4o', '  ', 'gpt-4o-mini'],
        customEndpoint: ['custom-model'],
      };

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig)).toEqual(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'azureOpenAI / gpt-4o',
              source: 'runtime',
              defaultRates: {
                prompt: 2.5,
                completion: 10,
                write: 2.5,
                read: 1.25,
              },
              defaultParameters: null,
            },
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              label: 'azureOpenAI / gpt-4o-mini',
              source: 'runtime',
              defaultRates: {
                prompt: 0.15,
                completion: 0.6,
                write: 0.15,
                read: 0.075,
              },
              defaultParameters: null,
            },
            {
              endpoint: 'openAI',
              model: 'gpt-4o',
              label: 'openAI / gpt-4o',
              source: 'runtime',
              defaultRates: {
                prompt: 2.5,
                completion: 10,
                write: 2.5,
                read: 1.25,
              },
              defaultParameters: null,
            },
            {
              endpoint: 'openAI',
              model: 'gpt-4o-mini',
              label: 'openAI / gpt-4o-mini',
              source: 'runtime',
              defaultRates: {
                prompt: 0.15,
                completion: 0.6,
                write: 0.15,
                read: 0.075,
              },
              defaultParameters: null,
            },
          ]),
        }),
      );
    });

    it('returns builtin managed-provider suggestions when no runtime endpoints are enabled', () => {
      expect(buildAdminChannelInventory(undefined, { azureOpenAI: ['gpt-4o'] })).toEqual(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            expect.objectContaining({
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              source: 'builtin',
            }),
            expect.objectContaining({
              endpoint: 'google',
              model: 'gemini-2.5-pro',
              source: 'builtin',
              defaultRates: {
                prompt: 1.25,
                completion: 10,
                write: null,
                read: null,
              },
            }),
            expect.objectContaining({
              endpoint: 'openAI',
              model: 'gpt-4o',
              source: 'builtin',
            }),
            expect.objectContaining({
              endpoint: 'anthropic',
              model: 'claude-sonnet-4-0',
              source: 'builtin',
            }),
            expect.objectContaining({
              endpoint: 'bedrock',
              model: expect.any(String),
              source: 'builtin',
            }),
          ]),
        }),
      );
    });

    it('filters out azure models that are not fully configured', () => {
      const endpointsConfig: TEndpointsConfig = {
        azureOpenAI: { order: 1 },
      };
      const modelsConfig: TModelsConfig = {
        azureOpenAI: ['gpt-4o'],
      };
      const appConfig = {
        endpoints: {
          azureOpenAI: {
            groupMap: {},
            modelGroupMap: {},
          },
        },
      } as AppConfig;

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig).inventory).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
            source: 'runtime',
          }),
        ]),
      );
    });

    it('filters out endpoints that are user-provided rather than configured server-side', () => {
      const endpointsConfig: TEndpointsConfig = {
        openAI: { order: 1, userProvide: true },
        azureOpenAI: { order: 2 },
      };
      const modelsConfig: TModelsConfig = {
        openAI: ['gpt-4o'],
        azureOpenAI: ['gpt-4o'],
      };
      const appConfig = {
        endpoints: {
          azureOpenAI: {
            groupMap: {
              default: {
                apiKey: 'azure-key',
                instanceName: 'az-coai',
                deploymentName: '',
                version: '2025-01-01-preview',
                models: {
                  'gpt-4o': {
                    deploymentName: 'gpt-4o',
                  },
                },
                serverless: false,
              },
            },
            modelGroupMap: {
              'gpt-4o': {
                group: 'default',
              },
            },
          },
        },
      } as AppConfig;

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig)).toEqual(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            expect.objectContaining({
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              source: 'runtime',
            }),
          ]),
        }),
      );
    });

    it('filters out custom endpoints whose env-backed config is unresolved', () => {
      const endpointsConfig: TEndpointsConfig = {
        Mistral: { order: 1, type: 'custom' },
        groq: { order: 2, type: 'custom', userProvide: true },
      };
      const modelsConfig: TModelsConfig = {
        Mistral: ['mistral-small'],
        groq: ['llama-3.3-70b'],
      };
      const appConfig = {
        endpoints: {
          custom: [
            {
              name: 'Mistral',
              apiKey: '${MISTRAL_API_KEY}',
              baseURL: 'https://api.mistral.ai/v1',
              models: {
                default: ['mistral-small'],
                fetch: true,
              },
            },
            {
              name: 'groq',
              apiKey: 'user_provided',
              baseURL: 'https://api.groq.com/openai/v1/',
              models: {
                default: ['llama-3.3-70b'],
                fetch: false,
              },
            },
          ],
        },
      } as AppConfig;

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig).inventory).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: 'Mistral',
            model: 'mistral-small',
          }),
        ]),
      );
    });

    it('includes custom endpoints with resolved server-side credentials', () => {
      process.env.MISTRAL_API_KEY = 'mistral-key';

      const endpointsConfig: TEndpointsConfig = {
        Mistral: { order: 1, type: 'custom' },
      };
      const modelsConfig: TModelsConfig = {
        Mistral: ['mistral-small'],
      };
      const appConfig = {
        endpoints: {
          custom: [
            {
              name: 'Mistral',
              apiKey: '${MISTRAL_API_KEY}',
              baseURL: 'https://api.mistral.ai/v1',
              models: {
                default: ['mistral-small'],
                fetch: true,
              },
            },
          ],
        },
      } as AppConfig;

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig)).toEqual(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            {
              endpoint: 'Mistral',
              model: 'mistral-small',
              label: 'Mistral / mistral-small',
              source: 'runtime',
              defaultRates: {
                prompt: 0.15,
                completion: 0.2,
                write: null,
                read: null,
              },
              defaultParameters: null,
            },
          ]),
        }),
      );
    });

    it('filters out custom endpoints whose required headers still contain unresolved env placeholders', () => {
      const endpointsConfig: TEndpointsConfig = {
        Portkey: { order: 1, type: 'custom' },
      };
      const modelsConfig: TModelsConfig = {
        Portkey: ['gpt-4o'],
      };
      const appConfig = {
        endpoints: {
          custom: [
            {
              name: 'Portkey',
              apiKey: 'dummy',
              baseURL: 'https://api.portkey.ai/v1',
              headers: {
                'x-portkey-api-key': '${PORTKEY_API_KEY}',
                'x-portkey-virtual-key': '${PORTKEY_OPENAI_VIRTUAL_KEY}',
              },
              models: {
                default: ['gpt-4o'],
                fetch: true,
              },
            },
          ],
        },
      } as AppConfig;

      expect(buildAdminChannelInventory(endpointsConfig, modelsConfig, appConfig).inventory).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: 'Portkey',
            model: 'gpt-4o',
          }),
        ]),
      );
    });
  });

  describe('filterModelsConfigToUsableEntries', () => {
    it('removes built-in endpoints that are not enabled in endpoints config', () => {
      const endpointsConfig: TEndpointsConfig = {
        azureOpenAI: { order: 1 },
      };
      const modelsConfig: TModelsConfig = {
        openAI: ['gpt-4o'],
        anthropic: ['claude-sonnet-4'],
        azureOpenAI: ['gpt-4o-mini'],
      };

      expect(filterModelsConfigToUsableEntries(endpointsConfig, modelsConfig)).toEqual({
        azureOpenAI: ['gpt-4o-mini'],
      });
    });

    it('removes built-in endpoints that are configured as user-provided', () => {
      const endpointsConfig: TEndpointsConfig = {
        openAI: { order: 1, userProvide: true },
        azureOpenAI: { order: 2 },
      };
      const modelsConfig: TModelsConfig = {
        openAI: ['gpt-4o'],
        azureOpenAI: ['gpt-4o'],
      };
      const appConfig = {
        endpoints: {
          azureOpenAI: {
            groupMap: {
              default: {
                apiKey: 'azure-key',
                instanceName: 'az-coai',
                deploymentName: '',
                version: '2025-01-01-preview',
                models: {
                  'gpt-4o': {
                    deploymentName: 'gpt-4o',
                  },
                },
                serverless: false,
              },
            },
            modelGroupMap: {
              'gpt-4o': {
                group: 'default',
              },
            },
          },
        },
      } as AppConfig;

      expect(filterModelsConfigToUsableEntries(endpointsConfig, modelsConfig, appConfig)).toEqual({
        azureOpenAI: ['gpt-4o'],
      });
    });

    it('removes unresolved custom endpoint models from the shared models config', () => {
      const endpointsConfig: TEndpointsConfig = {
        Portkey: { order: 1, type: 'custom' },
      };
      const modelsConfig: TModelsConfig = {
        Portkey: ['gpt-4o'],
      };
      const appConfig = {
        endpoints: {
          custom: [
            {
              name: 'Portkey',
              apiKey: 'dummy',
              baseURL: 'https://api.portkey.ai/v1',
              headers: {
                'x-portkey-api-key': '${PORTKEY_API_KEY}',
                'x-portkey-virtual-key': '${PORTKEY_OPENAI_VIRTUAL_KEY}',
              },
              models: {
                default: ['gpt-4o'],
                fetch: true,
              },
            },
          ],
        },
      } as AppConfig;

      expect(filterModelsConfigToUsableEntries(endpointsConfig, modelsConfig, appConfig)).toEqual(
        {},
      );
    });
  });

  describe('createGetAdminChannelInventory', () => {
    it('returns the normalized inventory payload', async () => {
      const req = {} as Request;
      const res = createMockResponse();
      const getAdminChannelInventory = createGetAdminChannelInventory({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            azureOpenAI: {
              groupMap: {
                default: {
                  apiKey: 'azure-key',
                  instanceName: 'az-coai',
                  deploymentName: '',
                  version: '2025-01-01-preview',
                  models: {
                    'gpt-4o': {
                      deploymentName: 'gpt-4o',
                    },
                  },
                  serverless: false,
                },
              },
              modelGroupMap: {
                'gpt-4o': {
                  group: 'default',
                },
              },
            },
          },
        }),
        getEndpointsConfig: jest.fn().mockResolvedValue({
          azureOpenAI: { order: 1 },
        }),
        getModelsConfig: jest.fn().mockResolvedValue({
          azureOpenAI: ['gpt-4o'],
        }),
      });

      await getAdminChannelInventory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            expect.objectContaining({
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              source: 'runtime',
              defaultRates: {
                prompt: 2.5,
                completion: 10,
                write: 2.5,
                read: 1.25,
              },
            }),
          ]),
        }),
      );
    });

    it('adds fetched local ollama models to admin inventory without exposing them through models config', async () => {
      mockFetchModels.mockResolvedValue(['llama3.1:latest', 'mistral:latest', 'phi3:latest']);

      const req = { user: { id: 'user-1' } } as unknown as Request;
      const res = createMockResponse();
      const getAdminChannelInventory = createGetAdminChannelInventory({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            custom: [
              {
                name: 'ollama',
                apiKey: 'ollama',
                baseURL: 'http://localhost:11434/v1',
                configuredModelsOnly: true,
                models: {
                  fetch: true,
                  default: ['llama3.1:latest'],
                },
              },
            ],
          },
        }),
        getEndpointsConfig: jest.fn().mockResolvedValue({
          ollama: { order: 1, type: 'custom', userProvide: false },
        }),
        getModelsConfig: jest.fn().mockResolvedValue({
          ollama: ['llama3.1:latest'],
        }),
      });

      await getAdminChannelInventory(req, res);

      expect(mockFetchModels).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ollama',
          apiKey: 'ollama',
          baseURL: 'http://localhost:11434/v1',
        }),
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          inventory: expect.arrayContaining([
            expect.objectContaining({
              endpoint: 'ollama',
              model: 'llama3.1:latest',
            }),
            expect.objectContaining({
              endpoint: 'ollama',
              model: 'mistral:latest',
            }),
            expect.objectContaining({
              endpoint: 'ollama',
              model: 'phi3:latest',
            }),
          ]),
        }),
      );
    });

    it('returns 500 when inventory loaders fail', async () => {
      const req = {} as Request;
      const res = createMockResponse();
      const getAdminChannelInventory = createGetAdminChannelInventory({
        getAppConfig: jest.fn().mockResolvedValue({}),
        getEndpointsConfig: jest.fn().mockRejectedValue(new Error('config failed')),
        getModelsConfig: jest.fn().mockResolvedValue({}),
      });

      await getAdminChannelInventory(req, res);

      expect(mockLoggerError).toHaveBeenCalledWith(
        '[getAdminChannelInventory]',
        expect.any(Error),
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'config failed' });
    });
  });
});
