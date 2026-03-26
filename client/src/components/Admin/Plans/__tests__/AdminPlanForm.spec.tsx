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
            description: '',
            enabled: true,
            sortOrder: 0,
            icon: '',
            entries: [],
            createdAt: null,
            updatedAt: null,
          },
          {
            id: 'channel-2',
            name: 'Premium',
            slug: 'premium',
            description: '',
            enabled: true,
            sortOrder: 10,
            icon: '',
            entries: [],
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
        notes: 'Internal users',
        startingCredits: 20000,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T01:00:00.000Z',
      },
    } as ReturnType<typeof useGetAdminPlanQuery>);
  });

  it('loads the selected plan into the form', () => {
    render(<AdminPlanForm />);

    const starterLabel = screen.getByText('Starter').closest('label');
    const premiumLabel = screen.getByText('Premium').closest('label');

    expect(starterLabel).not.toBeNull();
    expect(premiumLabel).not.toBeNull();
    expect(screen.getByDisplayValue('Pro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('pro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Power users')).toBeInTheDocument();
    expect(within(starterLabel as HTMLElement).getByRole('checkbox')).toBeChecked();
    expect(within(premiumLabel as HTMLElement).getByRole('checkbox')).toBeChecked();
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
