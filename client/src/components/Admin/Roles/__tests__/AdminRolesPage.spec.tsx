import { fireEvent, render, screen } from '@testing-library/react';
import AdminRolesPage from '../AdminRolesPage';

const mockCreateMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockUseGetAdminRolesQuery = jest.fn();
const mockUseCreateAdminRoleMutation = jest.fn();
const mockUseUpdateAdminRoleMutation = jest.fn();
const mockUseDeleteAdminRoleMutation = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminRolesQuery: (...args: unknown[]) => mockUseGetAdminRolesQuery(...args),
  useCreateAdminRoleMutation: (...args: unknown[]) => mockUseCreateAdminRoleMutation(...args),
  useUpdateAdminRoleMutation: (...args: unknown[]) => mockUseUpdateAdminRoleMutation(...args),
  useDeleteAdminRoleMutation: (...args: unknown[]) => mockUseDeleteAdminRoleMutation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminRolesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetAdminRolesQuery.mockReturnValue({
      isLoading: false,
      data: {
        roles: [
          {
            name: 'ADMIN',
            description: 'Built-in administrator role',
            isSystem: true,
            isEditable: false,
            isDeletable: false,
            permissions: {
              CHAT: { USE: true },
              PROMPTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
              BOOKMARKS: { USE: true },
              MEMORIES: { USE: true, CREATE: true, UPDATE: true, READ: true, OPT_OUT: true },
              AGENTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
              MULTI_CONVO: { USE: true },
              TEMPORARY_CHAT: { USE: true },
              RUN_CODE: { USE: true },
              WEB_SEARCH: { USE: true },
              PEOPLE_PICKER: { VIEW_USERS: true, VIEW_GROUPS: true, VIEW_ROLES: true },
              MARKETPLACE: { USE: true },
              FILE_SEARCH: { USE: true },
              FILE_CITATIONS: { USE: true },
              MCP_SERVERS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
              REMOTE_AGENTS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: true },
            },
          },
          {
            name: 'USER',
            description: 'Built-in user',
            isSystem: true,
            isEditable: true,
            isDeletable: false,
            permissions: {
              PROMPTS: { USE: true, CREATE: true, SHARE: false, SHARE_PUBLIC: false },
              BOOKMARKS: { USE: false },
              MEMORIES: { USE: false, CREATE: false, UPDATE: false, READ: false, OPT_OUT: false },
              AGENTS: { USE: true, CREATE: true, SHARE: false, SHARE_PUBLIC: false },
              MULTI_CONVO: { USE: false },
              TEMPORARY_CHAT: { USE: false },
              RUN_CODE: { USE: false },
              WEB_SEARCH: { USE: false },
              PEOPLE_PICKER: { VIEW_USERS: false, VIEW_GROUPS: false, VIEW_ROLES: false },
              MARKETPLACE: { USE: false },
              FILE_SEARCH: { USE: false },
              FILE_CITATIONS: { USE: false },
              MCP_SERVERS: { USE: true, CREATE: false, SHARE: false, SHARE_PUBLIC: false },
              REMOTE_AGENTS: { USE: false, CREATE: false, SHARE: false, SHARE_PUBLIC: false },
            },
          },
          {
            name: 'MEMBER',
            description: 'Custom member',
            isSystem: false,
            isEditable: true,
            isDeletable: true,
            permissions: {
              PROMPTS: { USE: true, CREATE: true, SHARE: false, SHARE_PUBLIC: false },
              BOOKMARKS: { USE: false },
              MEMORIES: { USE: false, CREATE: false, UPDATE: false, READ: false, OPT_OUT: false },
              AGENTS: { USE: true, CREATE: true, SHARE: false, SHARE_PUBLIC: false },
              MULTI_CONVO: { USE: false },
              TEMPORARY_CHAT: { USE: false },
              RUN_CODE: { USE: false },
              WEB_SEARCH: { USE: false },
              PEOPLE_PICKER: { VIEW_USERS: false, VIEW_GROUPS: false, VIEW_ROLES: false },
              MARKETPLACE: { USE: false },
              FILE_SEARCH: { USE: false },
              FILE_CITATIONS: { USE: false },
              MCP_SERVERS: { USE: true, CREATE: false, SHARE: false, SHARE_PUBLIC: false },
              REMOTE_AGENTS: { USE: false, CREATE: false, SHARE: false, SHARE_PUBLIC: false },
            },
          },
        ],
      },
    });
    mockUseCreateAdminRoleMutation.mockReturnValue({
      mutate: mockCreateMutate,
      isLoading: false,
      error: undefined,
    });
    mockUseUpdateAdminRoleMutation.mockReturnValue({
      mutate: mockUpdateMutate,
      isLoading: false,
    });
    mockUseDeleteAdminRoleMutation.mockReturnValue({
      mutate: mockDeleteMutate,
      isLoading: false,
    });
  });

  it('creates a role from the selected template permissions', () => {
    render(<AdminRolesPage />);

    fireEvent.change(screen.getByLabelText('com_ui_name'), {
      target: { value: 'SUPPORT' },
    });
    fireEvent.change(screen.getByLabelText('com_ui_admin_role_template'), {
      target: { value: 'MEMBER' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_create' }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SUPPORT',
        permissions: expect.objectContaining({
          AGENTS: expect.objectContaining({ USE: true }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('updates role permissions from the editor matrix', () => {
    render(<AdminRolesPage />);

    fireEvent.click(screen.getByLabelText('MEMBER-BOOKMARKS-USE'));
    fireEvent.click(screen.getAllByRole('button', { name: 'com_ui_save' })[2]);

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        roleName: 'MEMBER',
        permissions: expect.objectContaining({
          BOOKMARKS: { USE: true },
        }),
      }),
    );
  });

  it('keeps ADMIN permissions read-only', () => {
    render(<AdminRolesPage />);

    expect(screen.getByLabelText('ADMIN-CHAT-USE')).toBeDisabled();
  });
});
