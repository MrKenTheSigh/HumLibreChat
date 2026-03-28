import { render, screen } from 'test/layout-test-utils';
import { within } from '@testing-library/react';
import {
  useCreateAdminPlanMutation,
  useDeleteAdminPlanMutation,
  useGetAdminChannelsQuery,
  useGetAdminPlanQuery,
  useUpdateAdminPlanMutation,
} from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminPlanForm from '../AdminPlanForm';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({ planId: 'plan-1' }));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

jest.mock('~/data-provider/Admin', () => ({
  useCreateAdminPlanMutation: jest.fn(),
  useDeleteAdminPlanMutation: jest.fn(),
  useGetAdminChannelsQuery: jest.fn(),
  useGetAdminPlanQuery: jest.fn(),
  useUpdateAdminPlanMutation: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));

const mockUseCreateAdminPlanMutation = useCreateAdminPlanMutation as jest.MockedFunction<
  typeof useCreateAdminPlanMutation
>;
const mockUseDeleteAdminPlanMutation = useDeleteAdminPlanMutation as jest.MockedFunction<
  typeof useDeleteAdminPlanMutation
>;
const mockUseGetAdminChannelsQuery = useGetAdminChannelsQuery as jest.MockedFunction<
  typeof useGetAdminChannelsQuery
>;
const mockUseGetAdminPlanQuery = useGetAdminPlanQuery as jest.MockedFunction<
  typeof useGetAdminPlanQuery
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;
const mockUseUpdateAdminPlanMutation = useUpdateAdminPlanMutation as jest.MockedFunction<
  typeof useUpdateAdminPlanMutation
>;

describe('AdminPlanForm', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ planId: 'plan-1' });
    mockUseLocalize.mockReturnValue((key: string) => key);
    mockUseCreateAdminPlanMutation.mockReturnValue({
      isLoading: false,
      mutate: jest.fn(),
    } as ReturnType<typeof useCreateAdminPlanMutation>);
    mockUseUpdateAdminPlanMutation.mockReturnValue({
      isLoading: false,
      mutate: jest.fn(),
    } as ReturnType<typeof useUpdateAdminPlanMutation>);
    mockUseDeleteAdminPlanMutation.mockReturnValue({
      isLoading: false,
      mutate: jest.fn(),
    } as ReturnType<typeof useDeleteAdminPlanMutation>);
    mockUseGetAdminChannelsQuery.mockReturnValue({
      isLoading: false,
      data: {
        channels: [
          {
            id: 'channel-1',
            name: 'Starter',
            slug: 'starter',
            providerType: 'azureOpenAI',
            description: '',
            enabled: true,
            sortOrder: 0,
            connection: {
              runtimeEndpoint: 'azureOpenAI',
              baseURL: '',
              instanceName: '',
              apiVersion: '',
              modelFetch: false,
              headers: [],
            },
            secrets: {
              apiKey: '',
              apiKeyRef: '',
            },
            models: [
              {
                model: 'gpt-4o-mini',
                enabled: true,
                deploymentName: 'gpt-4o-mini',
                pricingOverride: null,
              },
            ],
            createdAt: null,
            updatedAt: null,
          },
          {
            id: 'channel-2',
            name: 'Premium',
            slug: 'premium',
            providerType: 'azureOpenAI',
            description: '',
            enabled: true,
            sortOrder: 10,
            connection: {
              runtimeEndpoint: 'azureOpenAI',
              baseURL: '',
              instanceName: '',
              apiVersion: '',
              modelFetch: false,
              headers: [],
            },
            secrets: {
              apiKey: '',
              apiKeyRef: '',
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
          },
        ],
      },
    } as ReturnType<typeof useGetAdminChannelsQuery>);
    mockUseGetAdminPlanQuery.mockReturnValue({
      isLoading: false,
      data: {
        id: 'plan-1',
        name: 'Pro',
        slug: 'pro',
        description: 'Power users',
        enabled: true,
        isDefault: true,
        sortOrder: 20,
        channelIds: ['channel-1', 'channel-2'],
        modelEntitlements: [
          {
            channelId: 'channel-1',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o-mini',
          },
          {
            channelId: 'channel-2',
            endpoint: 'azureOpenAI',
            model: 'gpt-4o',
          },
        ],
        notes: 'Internal users',
        startingCredits: 20000,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T01:00:00.000Z',
      },
    } as ReturnType<typeof useGetAdminPlanQuery>);
  });

  it('loads the selected plan into the form', () => {
    render(<AdminPlanForm />);

    const miniLabel = screen.getByText('gpt-4o-mini').closest('label');
    const gpt4oLabel = screen.getByText('gpt-4o').closest('label');

    expect(screen.getByDisplayValue('Pro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('pro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Power users')).toBeInTheDocument();
    expect(miniLabel).not.toBeNull();
    expect(gpt4oLabel).not.toBeNull();
    expect(within(miniLabel as HTMLElement).getByRole('checkbox')).toBeChecked();
    expect(within(gpt4oLabel as HTMLElement).getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button', { name: 'com_ui_delete' })).toBeInTheDocument();
  });

  it('renders create mode even when the disabled detail query reports loading', () => {
    mockUseParams.mockReturnValue({});
    mockUseGetAdminPlanQuery.mockReturnValue({
      isLoading: true,
      data: undefined,
    } as ReturnType<typeof useGetAdminPlanQuery>);

    render(<AdminPlanForm />);

    expect(screen.getByText('com_ui_admin_create_plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_create' })).toBeInTheDocument();
  });
});
