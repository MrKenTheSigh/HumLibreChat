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
                'gpt-4o-mini': {
                  deploymentName: 'gpt-4o-mini',
                },
              },
              serverless: false,
            },
          },
          modelGroupMap: {
            'gpt-4o': {
              group: 'default',
            },
            'gpt-4o-mini': {
              group: 'default',
            },
          },
        },
      },
    }),
    getEndpointsConfig: jest.fn().mockResolvedValue({
      azureOpenAI: {},
      openAI: {},
    }),
    getModelsConfig: jest.fn().mockResolvedValue({
      azureOpenAI: ['gpt-4o', 'gpt-4o-mini'],
      openAI: ['gpt-4.1-mini'],
    }),
  });
}

describe('admin channels handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdminChannels', () => {
    it('returns a sorted list of channels', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFind.mockReturnValue(
        createLeanQuery([
          {
            _id: channelId,
            name: 'Azure Premium',
            slug: 'azure-premium',
            description: 'High-capability Azure options',
            enabled: true,
            sortOrder: 10,
            icon: 'shield',
            entries: [
              {
                endpoint: 'azureOpenAI',
                model: 'gpt-4o',
                label: 'Azure GPT-4o',
                enabled: true,
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
            description: 'High-capability Azure options',
            enabled: true,
            sortOrder: 10,
            icon: 'shield',
            entries: [
              {
                endpoint: 'azureOpenAI',
                model: 'gpt-4o',
                label: 'Azure GPT-4o',
                enabled: true,
                defaultParameters: null,
              },
            ],
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('createAdminChannel', () => {
    it('creates a channel with inventory-backed entries', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminChannelCreate.mockResolvedValue({ _id: channelId });
      mockAdminChannelFindById.mockReturnValue(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Azure Premium',
          slug: 'azure-premium',
          description: 'High-capability Azure options',
          enabled: true,
          sortOrder: 10,
          icon: 'shield',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o',
              enabled: true,
            },
          ],
          createdAt: new Date('2026-03-26T00:00:00.000Z'),
          updatedAt: new Date('2026-03-26T01:00:00.000Z'),
        }),
      );

      const req = {
        body: {
          name: 'Azure Premium',
          slug: 'AZURE-PREMIUM',
          description: 'High-capability Azure options',
          enabled: true,
          sortOrder: 10,
          icon: 'shield',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o',
              enabled: true,
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(mockAdminChannelCreate).toHaveBeenCalledWith({
        name: 'Azure Premium',
        slug: 'azure-premium',
        description: 'High-capability Azure options',
        enabled: true,
        sortOrder: 10,
        icon: 'shield',
        entries: [
          {
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
            label: 'Azure GPT-4o',
            enabled: true,
            defaultParameters: null,
          },
        ],
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 400 for invalid inventory entries', async () => {
      const req = {
        body: {
          name: 'Broken',
          slug: 'broken',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'unknown-model',
              label: 'Unknown',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid channel entry: azureOpenAI / unknown-model',
      });
    });

    it('returns 400 for azure entries that are not actually configured', async () => {
      const handlers = createAdminChannelsHandlers({
        getAppConfig: jest.fn().mockResolvedValue({
          endpoints: {
            azureOpenAI: {
              groupMap: {},
              modelGroupMap: {},
            },
          },
        }),
        getEndpointsConfig: jest.fn().mockResolvedValue({
          azureOpenAI: {},
        }),
        getModelsConfig: jest.fn().mockResolvedValue({
          azureOpenAI: ['gpt-4o'],
        }),
      });

      const req = {
        body: {
          name: 'Azure Premium',
          slug: 'azure-premium',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await handlers.createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid channel entry: azureOpenAI / gpt-4o',
      });
    });

    it('returns 400 for custom entries without resolved server-side credentials', async () => {
      const handlers = createAdminChannelsHandlers({
        getAppConfig: jest.fn().mockResolvedValue({
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
        }),
        getEndpointsConfig: jest.fn().mockResolvedValue({
          Mistral: {},
        }),
        getModelsConfig: jest.fn().mockResolvedValue({
          Mistral: ['mistral-small'],
        }),
      });

      const req = {
        body: {
          name: 'Custom',
          slug: 'custom',
          entries: [
            {
              endpoint: 'Mistral',
              model: 'mistral-small',
              label: 'Mistral / mistral-small',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await handlers.createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid channel entry: Mistral / mistral-small',
      });
    });

    it('returns 400 for duplicate endpoint/model entries', async () => {
      const req = {
        body: {
          name: 'Duplicate',
          slug: 'duplicate',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o',
            },
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o Again',
            },
          ],
        },
      } as Request;
      const res = createMockResponse();

      await createHandlers().createAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Duplicate endpoint/model entries are not allowed',
      });
    });

    it('returns 409 for duplicate slugs', async () => {
      mockAdminChannelFindOne.mockReturnValue(
        createSelectLeanQuery({ _id: new mongoose.Types.ObjectId() }),
      );

      const req = {
        body: {
          name: 'Azure Premium',
          slug: 'azure-premium',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o',
              label: 'Azure GPT-4o',
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

  describe('updateAdminChannel', () => {
    it('updates an existing channel', async () => {
      const channelId = new mongoose.Types.ObjectId();
      mockAdminChannelFindById.mockReturnValueOnce(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Starter',
          slug: 'starter',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              label: 'Azure GPT-4o mini',
            },
          ],
        }),
      );
      mockAdminChannelFindOne.mockReturnValue(createSelectLeanQuery(null));
      mockAdminChannelFindByIdAndUpdate.mockReturnValue(
        createSelectLeanQuery({
          _id: channelId,
          name: 'Starter',
          slug: 'starter',
          description: '',
          enabled: true,
          sortOrder: 5,
          icon: '',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              label: 'Azure GPT-4o mini',
              enabled: true,
            },
          ],
          createdAt: new Date('2026-03-26T00:00:00.000Z'),
          updatedAt: new Date('2026-03-26T02:00:00.000Z'),
        }),
      );

      const req = {
        params: {
          channelId: channelId.toString(),
        },
        body: {
          name: 'Starter',
          slug: 'starter',
          entries: [
            {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
              label: 'Azure GPT-4o mini',
              enabled: true,
            },
          ],
        },
      } as unknown as Request;
      const res = createMockResponse();

      await createHandlers().updateAdminChannel(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
