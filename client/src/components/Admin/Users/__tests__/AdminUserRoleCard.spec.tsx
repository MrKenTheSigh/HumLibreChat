import { fireEvent, render, screen } from '@testing-library/react';
import AdminUserRoleCard from '../AdminUserRoleCard';

const mockMutate = jest.fn();
const mockUseGetAdminRolesQuery = jest.fn();
const mockUseUpdateAdminUserRoleMutation = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminRolesQuery: (...args: unknown[]) => mockUseGetAdminRolesQuery(...args),
  useUpdateAdminUserRoleMutation: (...args: unknown[]) =>
    mockUseUpdateAdminUserRoleMutation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminUserRoleCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetAdminRolesQuery.mockReturnValue({
      isLoading: false,
      data: {
        roles: [{ name: 'USER' }, { name: 'ADMIN' }, { name: 'MEMBER' }],
      },
    });
    mockUseUpdateAdminUserRoleMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: undefined,
    });
  });

  it('submits a new role assignment', () => {
    render(
      <AdminUserRoleCard
        userId="user-1"
        currentRole="USER"
        canChangeRole={true}
        isPrimaryAdminProtected={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('com_ui_role'), {
      target: { value: 'MEMBER' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(mockMutate).toHaveBeenCalledWith({ userId: 'user-1', roleName: 'MEMBER' });
  });

  it('disables role changes for the primary admin user', () => {
    render(
      <AdminUserRoleCard
        userId="user-1"
        currentRole="ADMIN"
        canChangeRole={false}
        isPrimaryAdminProtected={true}
      />,
    );

    expect(screen.getByLabelText('com_ui_role')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();
    expect(screen.getByText('com_ui_admin_primary_admin_locked')).toBeInTheDocument();
  });
});
