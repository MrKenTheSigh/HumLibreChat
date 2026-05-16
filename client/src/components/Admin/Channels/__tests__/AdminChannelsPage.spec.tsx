import { render, screen } from '@testing-library/react';
import type * as t from 'librechat-data-provider';
import AdminChannelsPage from '../AdminChannelsPage';

const mockNavigate = jest.fn();
const mockUseGetAdminChannelsQuery = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminChannelsQuery: (...args: unknown[]) => mockUseGetAdminChannelsQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('AdminChannelsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the managed channels list', () => {
    mockUseGetAdminChannelsQuery.mockReturnValue({
      data: {
        channels: [
          {
            id: 'channel-1',
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
              apiKeyRef: '',
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
                pricingOverride: null,
              },
            ],
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          } satisfies t.AdminChannel,
        ],
      },
      isLoading: false,
    });

    render(<AdminChannelsPage />);

    expect(screen.getByText('Azure Premium')).toBeInTheDocument();
    expect(screen.getByText('azure-premium')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_provider_type_azure_openai')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_enabled')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders non-custom provider labels correctly', () => {
    mockUseGetAdminChannelsQuery.mockReturnValue({
      data: {
        channels: [
          {
            id: 'channel-2',
            name: 'Google Flash',
            slug: 'google-flash',
            providerType: 'google',
            description: 'Managed Google channel',
            enabled: true,
            sortOrder: 20,
            connection: {
              runtimeEndpoint: 'google',
              baseURL: '',
              instanceName: '',
              apiVersion: '',
              region: '',
              modelFetch: false,
              headers: [],
            },
            secrets: {
              apiKey: '',
              apiKeyRef: '',
              accessKeyId: '',
              accessKeyIdRef: '',
              secretAccessKey: '',
              secretAccessKeyRef: '',
              sessionToken: '',
              sessionTokenRef: '',
            },
            models: [
              {
                model: 'gemini-2.5-flash',
                enabled: true,
                deploymentName: '',
                pricingOverride: null,
              },
            ],
            createdAt: null,
            updatedAt: null,
          } satisfies t.AdminChannel,
        ],
      },
      isLoading: false,
    });

    render(<AdminChannelsPage />);

    expect(screen.getByText('com_ui_admin_channel_provider_type_google')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_admin_channel_provider_type_custom')).not.toBeInTheDocument();
  });
});
