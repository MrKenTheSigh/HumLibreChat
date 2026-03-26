import { fireEvent, render, screen } from '@testing-library/react';
import AdminCreateUserCard from '../AdminCreateUserCard';

const mockMutate = jest.fn();
const mockUseCreateAdminUserMutation = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useCreateAdminUserMutation: (...args: unknown[]) => mockUseCreateAdminUserMutation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminCreateUserCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreateAdminUserMutation.mockReturnValue({
      mutate: mockMutate,
      isLoading: false,
      error: undefined,
    });
  });

  it('submits the create user payload and forwards success to the parent', () => {
    const onCreated = jest.fn();

    mockMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ id: 'user-2' });
    });

    render(<AdminCreateUserCard onCreated={onCreated} onCancel={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('com_ui_name'), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText('com_auth_email'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/com_auth_password/), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_create' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        name: 'New User',
        username: null,
        email: 'new@example.com',
        password: 'Password123',
        role: 'USER',
        emailVerified: true,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith('user-2');
  });
});
