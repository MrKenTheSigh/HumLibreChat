import { EModelEndpoint } from 'librechat-data-provider';
import {
  createLoadManagedChannelsIntoConfig,
  mergeManagedChannelsIntoConfig,
} from './runtimeConfig';

describe('managed runtime config merge', () => {
  it('merges enabled custom and azure managed channels into bootstrap config', async () => {
    const merged = mergeManagedChannelsIntoConfig(
      {
        endpoints: {
          [EModelEndpoint.custom]: [
            {
              name: 'BootstrapCustom',
              apiKey: '${BOOTSTRAP_API_KEY}',
              baseURL: 'https://bootstrap.example.com/v1',
              models: {
                default: ['bootstrap-model'],
              },
            },
          ],
          [EModelEndpoint.azureOpenAI]: {
            groups: [
              {
                group: 'bootstrap',
                apiKey: '${AZURE_OPENAI_API_KEY}',
                instanceName: 'bootstrap-instance',
                version: '2025-01-01-preview',
                models: {
                  'gpt-4o': {
                    deploymentName: 'gpt-4o',
                  },
                },
              },
            ],
          },
        },
      },
      [
        {
          _id: 'custom-1',
          name: 'Managed Mistral',
          slug: 'managed-mistral',
          providerType: 'custom',
          enabled: true,
          connection: {
            runtimeEndpoint: 'ManagedMistral',
            baseURL: 'https://managed.example.com/v1',
            modelFetch: true,
            headers: [{ key: 'x-tenant', value: 'managed' }],
          },
          secrets: {
            apiKeyRef: '${MANAGED_MISTRAL_API_KEY}',
          },
          models: [
            {
              model: 'mistral-large',
              enabled: true,
              deploymentName: '',
              pricingOverride: {
                prompt: 1.25,
                completion: 3.5,
                write: 0.4,
                read: 0.2,
              },
            },
          ],
        },
        {
          _id: 'ollama-1',
          name: 'Local Ollama',
          slug: 'local-ollama',
          providerType: 'ollama',
          enabled: true,
          connection: {
            runtimeEndpoint: 'ollama',
            baseURL: 'http://localhost:11434',
            ocrMaxPages: 8,
            modelFetch: true,
            headers: [],
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
        },
        {
          _id: 'azure-1',
          name: 'Managed Azure',
          slug: 'managed-azure',
          providerType: 'azureOpenAI',
          enabled: true,
          connection: {
            runtimeEndpoint: 'azureOpenAI',
            instanceName: 'managed-instance',
            apiVersion: '2025-01-01-preview',
            headers: [{ key: 'x-ms-region', value: 'eastus' }],
          },
          secrets: {
            apiKeyRef: '${MANAGED_AZURE_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o-mini',
              enabled: true,
              deploymentName: 'gpt-4o-mini',
              pricingOverride: {
                prompt: 0.2,
                completion: 0.8,
                write: 0.1,
                read: 0.05,
              },
            },
          ],
        },
      ],
    );

    expect(merged.endpoints?.[EModelEndpoint.custom]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ManagedMistral',
          apiKey: '${MANAGED_MISTRAL_API_KEY}',
          baseURL: 'https://managed.example.com/v1',
          tokenConfig: {
            'mistral-large': expect.objectContaining({
              prompt: 1.25,
              completion: 3.5,
              write: 0.4,
              read: 0.2,
            }),
          },
        }),
        expect.objectContaining({
          name: 'ollama',
          apiKey: 'ollama',
          baseURL: 'http://localhost:11434/v1',
          ocrMaxPages: 8,
          models: {
            default: ['llama3.2'],
            fetch: true,
          },
        }),
      ]),
    );
    expect(merged.endpoints?.[EModelEndpoint.azureOpenAI]?.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: 'managed-azure',
          instanceName: 'managed-instance',
          tokenConfig: {
            'gpt-4o-mini': expect.objectContaining({
              prompt: 0.2,
              completion: 0.8,
              write: 0.1,
              read: 0.05,
            }),
          },
          models: {
            'gpt-4o-mini': {
              deploymentName: 'gpt-4o-mini',
            },
          },
        }),
      ]),
    );
  });

  it('skips duplicate runtime endpoints and duplicate azure model names', () => {
    const merged = mergeManagedChannelsIntoConfig(
      {
        endpoints: {
          [EModelEndpoint.custom]: [
            {
              name: 'ManagedMistral',
              apiKey: '${BOOTSTRAP_API_KEY}',
              baseURL: 'https://bootstrap.example.com/v1',
              models: {
                default: ['bootstrap-model'],
              },
            },
          ],
          [EModelEndpoint.azureOpenAI]: {
            groups: [
              {
                group: 'bootstrap',
                apiKey: '${AZURE_OPENAI_API_KEY}',
                instanceName: 'bootstrap-instance',
                version: '2025-01-01-preview',
                models: {
                  'gpt-4o': {
                    deploymentName: 'gpt-4o',
                  },
                },
              },
            ],
          },
        },
      },
      [
        {
          _id: 'custom-1',
          name: 'Duplicate Custom',
          slug: 'duplicate-custom',
          providerType: 'custom',
          enabled: true,
          connection: {
            runtimeEndpoint: 'ManagedMistral',
            baseURL: 'https://duplicate.example.com/v1',
            modelFetch: false,
            headers: [],
          },
          secrets: {
            apiKeyRef: '${DUPLICATE_API_KEY}',
          },
          models: [
            {
              model: 'mistral-large',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        },
        {
          _id: 'azure-1',
          name: 'Duplicate Azure',
          slug: 'duplicate-azure',
          providerType: 'azureOpenAI',
          enabled: true,
          connection: {
            runtimeEndpoint: 'azureOpenAI',
            instanceName: 'duplicate-instance',
            apiVersion: '2025-01-01-preview',
            headers: [],
          },
          secrets: {
            apiKeyRef: '${DUPLICATE_AZURE_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              enabled: true,
              deploymentName: 'gpt-4o',
              pricingOverride: null,
            },
          ],
        },
      ],
    );

    expect(merged.endpoints?.[EModelEndpoint.custom]).toHaveLength(1);
    expect(merged.endpoints?.[EModelEndpoint.azureOpenAI]?.groups).toHaveLength(1);
  });

  it('loads enabled managed channels through the loader wrapper', async () => {
    const loadManagedChannelsIntoConfig = createLoadManagedChannelsIntoConfig({
      getEnabledChannels: jest.fn().mockResolvedValue([
        {
          _id: 'custom-1',
          name: 'Managed Mistral',
          slug: 'managed-mistral',
          providerType: 'custom',
          enabled: true,
          connection: {
            runtimeEndpoint: 'ManagedMistral',
            baseURL: 'https://managed.example.com/v1',
            modelFetch: false,
            headers: [],
          },
          secrets: {
            apiKeyRef: '${MANAGED_MISTRAL_API_KEY}',
          },
          models: [
            {
              model: 'mistral-large',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        },
      ]),
    });

    const merged = await loadManagedChannelsIntoConfig({});

    expect(merged.endpoints?.[EModelEndpoint.custom]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ManagedMistral',
        }),
      ]),
    );
  });

  it('merges managed standard provider channels into bootstrap config', () => {
    const merged = mergeManagedChannelsIntoConfig(
      {},
      [
        {
          _id: 'openai-1',
          name: 'Managed OpenAI',
          slug: 'managed-openai',
          providerType: 'openAI',
          enabled: true,
          connection: {
            runtimeEndpoint: 'openAI',
            baseURL: 'https://api.openai.example/v1',
            headers: [],
          },
          secrets: {
            apiKeyRef: '${OPENAI_API_KEY}',
          },
          models: [
            {
              model: 'gpt-4o',
              enabled: true,
              deploymentName: '',
              pricingOverride: {
                prompt: 1,
                completion: 4,
                write: null,
                read: null,
              },
            },
          ],
        },
        {
          _id: 'google-1',
          name: 'Managed Google',
          slug: 'managed-google',
          providerType: 'google',
          enabled: true,
          connection: {
            runtimeEndpoint: 'google',
            baseURL: 'https://google.example.com',
            headers: [],
          },
          secrets: {
            apiKeyRef: '${GOOGLE_KEY}',
          },
          models: [
            {
              model: 'gemini-2.5-pro',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        },
        {
          _id: 'anthropic-1',
          name: 'Managed Anthropic',
          slug: 'managed-anthropic',
          providerType: 'anthropic',
          enabled: true,
          connection: {
            runtimeEndpoint: 'anthropic',
            baseURL: 'https://anthropic.example.com',
            headers: [],
          },
          secrets: {
            apiKeyRef: '${ANTHROPIC_API_KEY}',
          },
          models: [
            {
              model: 'claude-sonnet-4-5',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        },
        {
          _id: 'bedrock-1',
          name: 'Managed Bedrock',
          slug: 'managed-bedrock',
          providerType: 'bedrock',
          enabled: true,
          connection: {
            runtimeEndpoint: 'bedrock',
            region: 'us-west-2',
            headers: [],
          },
          secrets: {
            accessKeyIdRef: '${AWS_ACCESS_KEY_ID}',
            secretAccessKeyRef: '${AWS_SECRET_ACCESS_KEY}',
          },
          models: [
            {
              model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
              enabled: true,
              deploymentName: '',
              pricingOverride: {
                prompt: 0.5,
                completion: 1.5,
                write: null,
                read: null,
              },
            },
          ],
        },
      ],
    );

    expect(merged.endpoints?.[EModelEndpoint.openAI]).toEqual(
      expect.objectContaining({
        apiKey: '${OPENAI_API_KEY}',
        baseURL: 'https://api.openai.example/v1',
        models: ['gpt-4o'],
        tokenConfig: {
          'gpt-4o': expect.objectContaining({
            prompt: 1,
            completion: 4,
          }),
        },
      }),
    );
    expect(merged.endpoints?.[EModelEndpoint.google]).toEqual(
      expect.objectContaining({
        apiKey: '${GOOGLE_KEY}',
        baseURL: 'https://google.example.com',
        models: ['gemini-2.5-pro'],
      }),
    );
    expect(merged.endpoints?.[EModelEndpoint.anthropic]).toEqual(
      expect.objectContaining({
        apiKey: '${ANTHROPIC_API_KEY}',
        baseURL: 'https://anthropic.example.com',
        models: ['claude-sonnet-4-5'],
      }),
    );
    expect(merged.endpoints?.[EModelEndpoint.bedrock]).toEqual(
      expect.objectContaining({
        region: 'us-west-2',
        accessKeyId: '${AWS_ACCESS_KEY_ID}',
        secretAccessKey: '${AWS_SECRET_ACCESS_KEY}',
        models: ['anthropic.claude-3-5-sonnet-20241022-v2:0'],
        availableRegions: ['us-west-2'],
        tokenConfig: {
          'anthropic.claude-3-5-sonnet-20241022-v2:0': expect.objectContaining({
            prompt: 0.5,
            completion: 1.5,
          }),
        },
      }),
    );
  });

  it('does not let empty bootstrap standard providers block managed provider channels', () => {
    const merged = mergeManagedChannelsIntoConfig(
      {
        endpoints: {
          [EModelEndpoint.google]: {
            apiKey: '',
          },
        },
      },
      [
        {
          _id: 'google-1',
          name: 'Managed Google',
          slug: 'managed-google',
          providerType: 'google',
          enabled: true,
          connection: {
            runtimeEndpoint: 'google',
            baseURL: 'https://google.example.com',
            headers: [],
          },
          secrets: {
            apiKey: 'managed-google-key',
          },
          models: [
            {
              model: 'gemini-2.5-flash',
              enabled: true,
              deploymentName: '',
              pricingOverride: null,
            },
          ],
        },
      ],
    );

    expect(merged.endpoints?.[EModelEndpoint.google]).toEqual(
      expect.objectContaining({
        apiKey: 'managed-google-key',
        baseURL: 'https://google.example.com',
        models: ['gemini-2.5-flash'],
      }),
    );
  });
});
