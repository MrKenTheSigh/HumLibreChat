import type { TModelsConfig, UserEntitlementsResponse } from 'librechat-data-provider';
import {
  createEntitlementLookup,
  filterModelSpecs,
  filterEndpointModels,
  getAllowedEndpointSelection,
  isEndpointVisible,
} from '../entitlements';

const restrictedEntitlements: UserEntitlementsResponse = {
  scope: 'assigned_plan',
  isRestricted: true,
  plan: {
    id: 'plan-1',
    name: 'Pro',
    slug: 'pro',
  },
  allowedChannels: [
    {
      id: 'channel-1',
      name: 'Starter',
      slug: 'starter',
    },
  ],
  allowedPairs: [
    {
      endpoint: 'azureOpenAI',
      model: 'gpt-4o-mini',
      channelId: 'channel-1',
      channelSlug: 'starter',
    },
    {
      endpoint: 'azureOpenAI',
      model: 'gpt-4o',
      channelId: 'channel-1',
      channelSlug: 'starter',
    },
  ],
};

describe('endpoint entitlements helpers', () => {
  it('builds a lookup from restricted entitlements', () => {
    const lookup = createEntitlementLookup(restrictedEntitlements);

    expect(lookup.isRestricted).toBe(true);
    expect(Array.from(lookup.allowedEndpoints)).toEqual(['azureOpenAI']);
    expect(Array.from(lookup.allowedModelsByEndpoint.get('azureOpenAI') ?? [])).toEqual([
      'gpt-4o-mini',
      'gpt-4o',
    ]);
  });

  it('keeps all models for unrestricted users', () => {
    expect(filterEndpointModels('azureOpenAI', ['gpt-4o-mini', 'gpt-4o'], undefined)).toEqual([
      'gpt-4o-mini',
      'gpt-4o',
    ]);
  });

  it('filters models to the allowed endpoint/model pairs', () => {
    expect(
      filterEndpointModels('azureOpenAI', ['gpt-4o-mini', 'gpt-4o', 'gpt-5.1-chat'], restrictedEntitlements),
    ).toEqual(['gpt-4o-mini', 'gpt-4o']);
    expect(
      filterEndpointModels('openAI', ['gpt-4.1-mini'], restrictedEntitlements),
    ).toEqual([]);
  });

  it('marks blocked endpoints as hidden for restricted users', () => {
    expect(isEndpointVisible('azureOpenAI', restrictedEntitlements)).toBe(true);
    expect(isEndpointVisible('openAI', restrictedEntitlements)).toBe(false);
  });

  it('keeps the preferred endpoint when it still has an allowed model', () => {
    const modelsConfig: TModelsConfig = {
      azureOpenAI: ['gpt-4o-mini', 'gpt-4o', 'gpt-5.1-chat'],
      openAI: ['gpt-4.1-mini'],
    };

    expect(
      getAllowedEndpointSelection({
        preferredEndpoint: 'azureOpenAI',
        endpoints: ['azureOpenAI', 'openAI'],
        modelsConfig,
        entitlements: restrictedEntitlements,
      }),
    ).toEqual({
      endpoint: 'azureOpenAI',
      models: ['gpt-4o-mini', 'gpt-4o'],
    });
  });

  it('falls back to the first allowed endpoint when the preferred endpoint is blocked', () => {
    const modelsConfig: TModelsConfig = {
      openAI: ['gpt-4.1-mini'],
      azureOpenAI: ['gpt-4o-mini', 'gpt-4o'],
    };

    expect(
      getAllowedEndpointSelection({
        preferredEndpoint: 'openAI',
        endpoints: ['openAI', 'azureOpenAI'],
        modelsConfig,
        entitlements: restrictedEntitlements,
      }),
    ).toEqual({
      endpoint: 'azureOpenAI',
      models: ['gpt-4o-mini', 'gpt-4o'],
    });
  });

  it('falls back to the first unrestricted endpoint that still has models', () => {
    const modelsConfig: TModelsConfig = {
      openAI: [],
      azureOpenAI: ['gpt-4o-mini'],
    };

    expect(
      getAllowedEndpointSelection({
        preferredEndpoint: 'openAI',
        endpoints: ['openAI', 'azureOpenAI'],
        modelsConfig,
        entitlements: undefined,
      }),
    ).toEqual({
      endpoint: 'azureOpenAI',
      models: ['gpt-4o-mini'],
    });
  });

  it('keeps agents as the preferred endpoint even though agents are not listed by models config', () => {
    const modelsConfig: TModelsConfig = {
      openAI: ['gpt-4.1-mini'],
    };

    expect(
      getAllowedEndpointSelection({
        preferredEndpoint: 'agents',
        endpoints: ['agents', 'openAI'],
        modelsConfig,
        entitlements: undefined,
      }),
    ).toEqual({
      endpoint: 'agents',
      models: [],
    });
  });

  it('hides model specs that point to blocked endpoint/model pairs', () => {
    expect(
      filterModelSpecs(
        [
          {
            name: 'allowed',
            label: 'Allowed',
            preset: {
              endpoint: 'azureOpenAI',
              model: 'gpt-4o-mini',
            },
          },
          {
            name: 'blocked-model',
            label: 'Blocked Model',
            preset: {
              endpoint: 'azureOpenAI',
              model: 'gpt-5.1-chat',
            },
          },
          {
            name: 'blocked-endpoint',
            label: 'Blocked Endpoint',
            preset: {
              endpoint: 'openAI',
              model: 'gpt-4.1-mini',
            },
          },
          {
            name: 'endpoint-only',
            label: 'Endpoint Only',
            preset: {
              endpoint: 'azureOpenAI',
            },
          },
        ],
        restrictedEntitlements,
      ).map((spec) => spec.name),
    ).toEqual(['allowed', 'endpoint-only']);
  });
});
