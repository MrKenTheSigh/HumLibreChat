import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const mockAdminChannelCreate = jest.fn();
const mockAdminChannelDeleteOne = jest.fn();
const mockAdminChannelFind = jest.fn();
const mockAdminChannelFindById = jest.fn();
const mockAdminChannelFindByIdAndUpdate = jest.fn();
const mockAdminChannelFindOne = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  createModels: jest.fn(() => ({
    AdminChannel: {
      create: mockAdminChannelCreate,
      deleteOne: mockAdminChannelDeleteOne,
      find: mockAdminChannelFind,
      findById: mockAdminChannelFindById,
      findByIdAndUpdate: mockAdminChannelFindByIdAndUpdate,
      findOne: mockAdminChannelFindOne,
    },
  })),
  logger: {
    error: mockLoggerError,
  },
}));

const { createAdminChannelsHandlers } = require('./channels');

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

function createMockResponse(): MockResponse {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json } as unknown as MockResponse;
}

function createLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createSelectLeanQuery<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createHandlers() {
  return createAdminChannelsHandlers({
    getAppConfig: jest.fn(),
    getEndpointsConfig: jest.fn(),
    getModelsConfig: jest.fn(),
    refreshRuntimeConfig: jest.fn().mockResolvedValue(undefined),
  });
}

describe('admin channels handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdminChannels', () => {
    it('returns managed channels with the new domain shape', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFind.mockReturnValue(
        createLeanQuery([
          {
            _id: channelId,
            name: 'Azure Premium',
            slug: 'azure-premium',
            providerType: 'azureOpenAI',
            description: 'High-capability Azure options',
            enabled: true,
            sortOrder: 10,
            connection: {
              runtimeEndpoint: 'azureOpenAI',
              instanceName: 'az-coai',
              apiVersion: '2025-01-01-preview',
            },
            secrets: {
              apiKeyRef: '${AZURE_OPENAI_API_KEY}',
            },
            models: [
              {
                model: 'gpt-4o',
                enabled: true,
                deploymentName: 'gpt-4o',
                pricingOverride: {
                  prompt: 1,
                  completion: 2,
                },
              },
            ],
            createdAt: new Date('2026-03-26T00:00:00.000Z'),
            updatedAt: new Date('2026-03-26T01:00:00.000Z'),
          },
        ]),
      );

      const res = createMockResponse();

      await createHandlers().getAdminChannels({} as Request, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        channels: [
          {
            id: channelId.toString(),
            name: 'Azure Premium',
            slug: 'azure-premium',
            providerType: 'azureOpenAI',
            description: 'High-capability Azure options',
            enabled: true,
            sortOrder: 10,
            connection: {
              runtimeEndpoint: 'azureOpenAI',
              baseURL: '',
              instanceName: 'az-coai',
              apiVersion: '2025-01-01-preview',
              region: '',
              modelFetch: false,
              headers: [],
            },
            secrets: {
              apiKey: '',
              apiKeyRef: '${AZURE_OPENAI_API_KEY}',
              accessKeyId: '',
              accessKeyIdRef: '',
              secretAccessKey: '',
              secretAccessKeyRef: '',
              sessionToken: '',
              sessionTokenRef: '',
            },
            models: [
              {
                model: 'gpt-4o',
                enabled: true,
                deploymentName: 'gpt-4o',
                pricingOverride: {
                  prompt: 1,
                  completion: 2,
                  write: null,
                  read: null,
                },
              },
            ],
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          },
        ],
      });
    });

    it('normalizes legacy entry-based channels while reading', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFind.mockReturnValue(
        createLeanQuery([
          {
            _id: channelId,
            name: 'Legacy Azure',
            slug: 'legacy-azure',
            description: 'Legacy overlay channel',
            enabled: true,
            sortOrder: 1,
            entries: [
              {
                endpoint: 'azureOpenAI',
                model: 'gpt-4o',
                enabled: true,
              },
            ],
          },
        ]),
      );

      const res = createMockResponse();

      await createHandlers().getAdminChannels({} as Request, res);

      expect(res.json).toHaveBeenCalledWith({
        channels: [
          expect.objectContaining({
            providerType: 'azureOpenAI',
            connection: expect.objectContaining({
              runtimeEndpoint: 'azureOpenAI',
            }),
            models: [
              {
                model: 'gpt-4o',
                enabled: true,
                deploymentName: '',
                pricingOverride: null,
              },
            ],
          }),
        ],
      });
    });
  });

  describe('createAdminChannel', () => {
    it('creates a managed channel with connection and model metadata', async () => {
      const channelId = new mongoose.Types.ObjectId();
      const refreshRuntimeConfig = jest.fn().mockResolvedValue(undefined);
      mockAdminChannelFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminChannelCreate.mockResolvedValue({ _id: channelId });
      mockAdminChannelFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Azure Premium',
          slug: 'azure-premium',
          providerType: 'azureOpenAI',
          description: 'High-capability Azure options',
          enabled: true,
          sortOrder: 10,
          connection: {
            runtimeEndpoint: 'azureOpenAI',
            instanceName: 'az-coai',
            apiVersion: '2025-01-01-preview',
          },
          secrets: {
            apiKeyRef: '${AZURE_OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              enabled: true,
              deploymentName: 'gpt-4o',
              pricingOverride: {
                prompt: 1,
                completion: 2,
                write: null,
                read: null,
              },
            },
          ],
        }),
      );

      const req = {
        body: {
          name: 'Azure Premium',
          slug: 'AZURE-PREMIUM',
          providerType: 'azureOpenAI',
          description: 'High-capability Azure options',
          enabled: true,
          sortOrder: 10,
          connection: {
            runtimeEndpoint: 'azureOpenAI',
            instanceName: 'az-coai',
            apiVersion: '2025-01-01-preview',
            modelFetch: false,
            headers: [],
          },
          secrets: {
            apiKey: '',
            apiKeyRef: '${AZURE_OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              enabled: true,
              deploymentName: 'gpt-4o',
              pricingOverride: {
                prompt: 1,
                completion: 2,
                write: null,
                read: null,
              },
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createAdminChannelsHandlers({
        getAppConfig: jest.fn(),
        getEndpointsConfig: jest.fn(),
        getModelsConfig: jest.fn(),
        refreshRuntimeConfig,
      }).createAdminChannel(req, res);

      expect(mockAdminChannelCreate).toHaveBeenCalledWith({
        name: 'Azure Premium',
        slug: 'azure-premium',
        providerType: 'azureOpenAI',
        description: 'High-capability Azure options',
        enabled: true,
        sortOrder: 10,
        connection: {
          runtimeEndpoint: 'azureOpenAI',
          baseURL: '',
          instanceName: 'az-coai',
          apiVersion: '2025-01-01-preview',
          region: '',
          modelFetch: false,
          headers: [],
        },
        secrets: {
          apiKey: '',
          apiKeyRef: '${AZURE_OPENAI_API_KEY}',
          accessKeyId: '',
          accessKeyIdRef: '',
          secretAccessKey: '',
          secretAccessKeyRef: '',
          sessionToken: '',
          sessionTokenRef: '',
        },
        models: [
          {
            model: 'gpt-4o',
            enabled: true,
            deploymentName: 'gpt-4o',
            pricingOverride: {
              prompt: 1,
              completion: 2,
              write: null,
              read: null,
            },
          },
        ],
      });
      expect(refreshRuntimeConfig).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 when azure channels target a non-azure runtime endpoint', async () => {
      const req = {
        body: {
          name: 'Broken Azure',
          slug: 'broken-azure',
          providerType: 'azureOpenAI',
          connection: {
            runtimeEndpoint: 'Mistral',
          },
          secrets: {},
          models: [
            {
              model: 'gpt-4o',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Azure channels require an instance name',
      });
    });

    it('creates a managed openai channel with provider runtime defaults', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminChannelCreate.mockResolvedValue({ _id: channelId });
      mockAdminChannelFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Managed OpenAI',
          slug: 'managed-openai',
          providerType: 'openAI',
          description: '',
          enabled: true,
          sortOrder: 0,
          connection: {
            runtimeEndpoint: 'openAI',
            baseURL: 'https://api.openai.example/v1',
          },
          secrets: {
            apiKeyRef: '${OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        }),
      );

      const req = {
        body: {
          name: 'Managed OpenAI',
          slug: 'managed-openai',
          providerType: 'openAI',
          description: '',
          enabled: true,
          sortOrder: 0,
          connection: {
            runtimeEndpoint: 'ignored-by-normalizer',
            baseURL: 'https://api.openai.example/v1',
            modelFetch: false,
            headers: [],
          },
          secrets: {
            apiKeyRef: '${OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(mockAdminChannelCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerType: 'openAI',
          connection: expect.objectContaining({
            runtimeEndpoint: 'openAI',
            baseURL: 'https://api.openai.example/v1',
          }),
          secrets: expect.objectContaining({
            apiKeyRef: '${OPENAI_API_KEY}',
          }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creates a managed ollama channel without requiring an API key', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminChannelCreate.mockResolvedValue({ _id: channelId });
      mockAdminChannelFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Local Ollama',
          slug: 'local-ollama',
          providerType: 'ollama',
          description: '',
          enabled: true,
          sortOrder: 0,
          connection: {
            runtimeEndpoint: 'ollama',
            baseURL: 'http://localhost:11434/v1',
            modelFetch: true,
          },
          secrets: {},
          models: [
            {
              model: 'llama3.2',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        }),
      );

      const req = {
        body: {
          name: 'Local Ollama',
          slug: 'local-ollama',
          providerType: 'ollama',
          description: '',
          enabled: true,
          sortOrder: 0,
          connection: {
            runtimeEndpoint: 'ignored-by-normalizer',
            baseURL: 'http://localhost:11434/v1',
            modelFetch: true,
            headers: [],
          },
          secrets: {},
          models: [
            {
              model: 'llama3.2',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(mockAdminChannelCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerType: 'ollama',
          connection: expect.objectContaining({
            runtimeEndpoint: 'ollama',
            baseURL: 'http://localhost:11434/v1',
            modelFetch: true,
          }),
          secrets: expect.objectContaining({
            apiKey: '',
            apiKeyRef: '',
          }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 when bedrock static credentials are incomplete', async () => {
      const req = {
        body: {
          name: 'Managed Bedrock',
          slug: 'managed-bedrock',
          providerType: 'bedrock',
          connection: {
            runtimeEndpoint: 'bedrock',
            region: 'us-west-2',
          },
          secrets: {
            accessKeyIdRef: '${AWS_ACCESS_KEY_ID}',
          },
          models: [
            {
              model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message:
          'Bedrock channels require both access key ID and secret access key when using static credentials',
      });
    });

    it('returns 409 for duplicate slugs', async () => {
      mockAdminChannelFindOne.mockReturnValue(
        createSelectLeanQuery({
          _id: new mongoose.Types.ObjectId(),
        }),
      );

      const req = {
        body: {
          name: 'Azure Premium',
          slug: 'azure-premium',
          providerType: 'azureOpenAI',
          connection: {
            runtimeEndpoint: 'azureOpenAI',
            instanceName: 'az-coai',
            apiVersion: '2025-01-01-preview',
          },
          secrets: {
            apiKeyRef: '${AZURE_OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              deploymentName: 'gpt-4o',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'A channel with this slug already exists',
      });
    });
  });
});
