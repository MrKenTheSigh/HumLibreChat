import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as t from 'librechat-data-provider';
import { MemoryRouter } from 'react-router-dom';
import AdminChannelForm from '../AdminChannelForm';

const mockNavigate = jest.fn();
const mockUseCreateAdminChannelMutation = jest.fn();
const mockUseDeleteAdminChannelMutation = jest.fn();
const mockUseGetAdminChannelInventoryQuery = jest.fn();
const mockUseGetAdminChannelQuery = jest.fn();
const mockUseParams = jest.fn(() => ({ channelId: 'channel-1' }));
const mockUseUpdateAdminChannelMutation = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useCreateAdminChannelMutation: (...args: unknown[]) => mockUseCreateAdminChannelMutation(...args),
  useDeleteAdminChannelMutation: (...args: unknown[]) => mockUseDeleteAdminChannelMutation(...args),
  useGetAdminChannelInventoryQuery: (...args: unknown[]) =>
    mockUseGetAdminChannelInventoryQuery(...args),
  useGetAdminChannelQuery: (...args: unknown[]) => mockUseGetAdminChannelQuery(...args),
  useUpdateAdminChannelMutation: (...args: unknown[]) => mockUseUpdateAdminChannelMutation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

describe('AdminChannelForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ channelId: 'channel-1' });
    mockUseCreateAdminChannelMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: undefined,
    });
    mockUseUpdateAdminChannelMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: undefined,
    });
    mockUseGetAdminChannelInventoryQuery.mockReturnValue({
      data: {
        inventory: [
          {
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
            label: 'azureOpenAI / gpt-4o',
            source: 'builtin',
            defaultRates: {
              prompt: 2.5,
              completion: 10,
              write: 2.5,
              read: 1.25,
            },
            defaultParameters: null,
          },
          {
            endpoint: 'google',
            model: 'gemini-2.5-pro',
            label: 'google / gemini-2.5-pro',
            source: 'builtin',
            defaultRates: {
              prompt: 1.25,
              completion: 10,
              write: null,
              read: null,
            },
            defaultParameters: null,
          },
        ],
      } satisfies t.AdminChannelInventoryResponse,
    });
    mockUseDeleteAdminChannelMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: undefined,
    });
  });

  it('renders existing managed channel details and models', () => {
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: {
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
      } satisfies t.AdminChannel,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('Azure Premium')).toBeInTheDocument();
    expect(screen.getByDisplayValue('azure-premium')).toBeInTheDocument();
    expect(screen.getByDisplayValue('az-coai')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2025-01-01-preview')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('gpt-4o')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'com_ui_delete' })).toBeInTheDocument();
  });

  it('renders create mode even when the disabled detail query reports loading', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    expect(screen.getByText('com_ui_admin_create_channel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_create' })).toBeInTheDocument();
  });

  it('locks the runtime endpoint field for azure channels', async () => {
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: {
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
            model: 'gpt-4o',
            enabled: true,
            deploymentName: 'gpt-4o',
            pricingOverride: null,
          },
        ],
        createdAt: null,
        updatedAt: null,
      } satisfies t.AdminChannel,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('azureOpenAI')).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByText('com_ui_admin_channel_builtin_model_help')).toBeInTheDocument();
    });
  });

  it('shows bedrock-specific region and aws secret fields', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_provider'), {
      target: { value: 'bedrock' },
    });

    expect(screen.getByDisplayValue('bedrock')).toBeDisabled();
    expect(screen.getByText('com_ui_region')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_access_key_id')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_secret_access_key')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_session_token')).toBeInTheDocument();
  });

  it('shows manual model entry inputs for google channels', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_provider'), {
      target: { value: 'google' },
    });

    expect(screen.getByDisplayValue('google')).toBeDisabled();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(1);
    expect(screen.getByText('com_ui_admin_channel_builtin_model_help')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('com_ui_admin_channel_model_placeholder')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_models_builtin_available')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_api_key')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'com_ui_show' })).toBeInTheDocument();
  });

  it('shows ollama as a dedicated provider with default local connection settings', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_provider'), {
      target: { value: 'ollama' },
    });

    expect(screen.getByDisplayValue('ollama')).toBeDisabled();
    expect(screen.getByDisplayValue('http://localhost:11434/v1')).toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_api_key')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_channel_model_fetch')).toBeInTheDocument();
  });

  it('prefills builtin default rates when a suggested model is selected', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('com_ui_provider'), {
      target: { value: 'google' },
    });

    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: 'gemini-2.5-pro' },
    });

    expect(screen.getByLabelText('com_ui_model')).toHaveValue('gemini-2.5-pro');
    expect(screen.getByDisplayValue('1.25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
  });

  it('toggles api key visibility', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    const apiKeyInput = screen.getByLabelText('com_ui_api_key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_show' }));
    expect(apiKeyInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'com_ui_hide' })).toBeInTheDocument();
  });
});
