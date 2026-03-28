import { fireEvent, render, screen } from '@testing-library/react';
import AdminUserProvisioningCard from '../AdminUserProvisioningCard';

const mockMutate = jest.fn();
const mockUseApplyAdminUserStartingCreditsMutation = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useApplyAdminUserStartingCreditsMutation: (...args: unknown[]) =>
    mockUseApplyAdminUserStartingCreditsMutation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminUserProvisioningCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseApplyAdminUserStartingCreditsMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: undefined,
    });
  });

  it('renders provisioning details and applies starting credits when eligible', () => {
    render(
      <AdminUserProvisioningCard
        userId="user-1"
        currentPlan={{
          id: 'plan-1',
          name: 'Starter',
          slug: 'starter',
          startingCredits: 5000,
        }}
        provisioning={{
          balanceEnabled: true,
          hasBalanceRecord: true,
          currentPlanStartingCredits: 5000,
          appliedAt: null,
          appliedPlanId: null,
          appliedAmount: null,
          appliedSource: null,
          appliedPlanMatchesCurrent: false,
          canApplyStartingCredits: true,
        }}
      />,
    );

    expect(screen.getByText('com_ui_admin_plan_provisioning')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_provisioning_ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_apply_starting_credits' }));

    expect(mockMutate).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('disables the apply action when provisioning is already applied for the current plan', () => {
    render(
      <AdminUserProvisioningCard
        userId="user-1"
        currentPlan={{
          id: 'plan-1',
          name: 'Starter',
          slug: 'starter',
          startingCredits: 5000,
        }}
        provisioning={{
          balanceEnabled: true,
          hasBalanceRecord: true,
          currentPlanStartingCredits: 5000,
          appliedAt: '2026-03-26T05:00:00.000Z',
          appliedPlanId: 'plan-1',
          appliedAmount: 5000,
          appliedSource: 'admin_manual_apply',
          appliedPlanMatchesCurrent: true,
          canApplyStartingCredits: false,
        }}
      />,
    );

    expect(
      screen.getByText('com_ui_admin_provisioning_applied_current_plan'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'com_ui_admin_apply_starting_credits' }),
    ).toBeDisabled();
  });
});
