import { fireEvent, render, screen } from '@testing-library/react';
import AdminUserPlanCard from '../AdminUserPlanCard';

const mockAssignMutate = jest.fn();
const mockClearMutate = jest.fn();
const mockUseAssignAdminUserPlanMutation = jest.fn();
const mockUseClearAdminUserPlanMutation = jest.fn();
const mockUseGetAdminPlansQuery = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useAssignAdminUserPlanMutation: (...args: unknown[]) =>
    mockUseAssignAdminUserPlanMutation(...args),
  useClearAdminUserPlanMutation: (...args: unknown[]) =>
    mockUseClearAdminUserPlanMutation(...args),
  useGetAdminPlansQuery: (...args: unknown[]) => mockUseGetAdminPlansQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminUserPlanCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAssignAdminUserPlanMutation.mockReturnValue({
      mutate: mockAssignMutate,
      isLoading: false,
      error: undefined,
    });
    mockUseClearAdminUserPlanMutation.mockReturnValue({
      mutate: mockClearMutate,
      isLoading: false,
      error: undefined,
    });
  });

  it('renders current assignment and can assign or clear a plan', async () => {
    mockUseGetAdminPlansQuery.mockReturnValue({
      data: {
        plans: [
          {
            id: 'plan-1',
            name: 'Pro',
            slug: 'pro',
            description: '',
            enabled: true,
            isDefault: false,
            sortOrder: 0,
            channelIds: [],
            notes: '',
            startingCredits: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
      },
      isLoading: false,
    });

    render(
      <AdminUserPlanCard
        userId="user-1"
        currentPlan={{ id: 'plan-1', name: 'Pro', slug: 'pro' }}
        assignedAt="2026-03-26T03:00:00.000Z"
      />,
    );

    expect(screen.getAllByText('Pro (pro)').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'plan-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_assign_plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_clear_plan' }));

    expect(mockAssignMutate).toHaveBeenCalledWith({
      userId: 'user-1',
      planId: 'plan-1',
    });
    expect(mockClearMutate).toHaveBeenCalledWith('user-1');
  });

  it('shows the empty state when no plans exist', async () => {
    mockUseGetAdminPlansQuery.mockReturnValue({
      data: {
        plans: [],
      },
      isLoading: false,
    });

    render(
      <AdminUserPlanCard userId="user-1" currentPlan={null} assignedAt={null} />,
    );

    expect(screen.getByText('com_ui_admin_no_plans_available')).toBeInTheDocument();
  });
});
