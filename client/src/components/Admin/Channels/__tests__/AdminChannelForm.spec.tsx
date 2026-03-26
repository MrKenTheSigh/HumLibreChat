import { render, screen } from '@testing-library/react';
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
    mockUseDeleteAdminChannelMutation.mockReturnValue({
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
            defaultParameters: null,
          },
        ],
      },
      isLoading: false,
    });
  });

  it('renders existing channel details and entries', async () => {
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: {
        id: 'channel-1',
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
    expect(screen.getByDisplayValue('shield')).toBeInTheDocument();
    expect(screen.getAllByText('Azure OpenAI / gpt-4o').length).toBeGreaterThan(0);
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

  it('hides already selected inventory entries from the add selector', () => {
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: {
        id: 'channel-1',
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
      } satisfies t.AdminChannel,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <AdminChannelForm />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('option', { name: 'Azure OpenAI / gpt-4o' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_add' })).toBeDisabled();
  });

  it('normalizes legacy inventory-style labels to the display label in the entry card', () => {
    mockUseGetAdminChannelQuery.mockReturnValue({
      data: {
        id: 'channel-1',
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
            label: 'azureOpenAI / gpt-4o',
            enabled: true,
            defaultParameters: null,
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

    expect(screen.getAllByText('Azure OpenAI / gpt-4o').length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('azureOpenAI / gpt-4o')).not.toBeInTheDocument();
  });
});
