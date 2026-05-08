import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminUsagePage from '../AdminUsagePage';

const mockUseGetAdminTransactionsQuery = jest.fn();
const mockUseGetAdminUsageSummaryQuery = jest.fn();
const mockUseGetAdminUsageMembersQuery = jest.fn();
const mockUseGetAdminDepartmentsQuery = jest.fn();
const mockExportAdminTransactionsCsv = jest.fn();
const mockExportAdminUsageMembersCsv = jest.fn();
const mockGetAdminTransactionsExportCount = jest.fn();
const mockGetAdminUsageMembersExportCount = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      exportAdminTransactionsCsv: (...args: unknown[]) => mockExportAdminTransactionsCsv(...args),
      exportAdminUsageMembersCsv: (...args: unknown[]) => mockExportAdminUsageMembersCsv(...args),
      getAdminTransactionsExportCount: (...args: unknown[]) =>
        mockGetAdminTransactionsExportCount(...args),
      getAdminUsageMembersExportCount: (...args: unknown[]) =>
        mockGetAdminUsageMembersExportCount(...args),
    },
  };
});

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminDepartmentsQuery: (...args: unknown[]) => mockUseGetAdminDepartmentsQuery(...args),
  useGetAdminUsageMembersQuery: (...args: unknown[]) => mockUseGetAdminUsageMembersQuery(...args),
  useGetAdminTransactionsQuery: (...args: unknown[]) => mockUseGetAdminTransactionsQuery(...args),
  useGetAdminUsageSummaryQuery: (...args: unknown[]) => mockUseGetAdminUsageSummaryQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: { 0?: string; 1?: string }) =>
    options?.[0] ? `${key}:${options[0]}:${options[1] ?? ''}` : key,
  useAuthContext: () => ({
    user: {
      role: 'ADMIN',
    },
  }),
}));

describe('AdminUsagePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.URL.createObjectURL = jest.fn(() => 'blob:admin-usage-csv');
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    mockExportAdminTransactionsCsv.mockResolvedValue({
      data: new Blob(['transactions']),
      headers: {
        'x-export-truncated': 'false',
        'x-export-limit': '10000',
      },
    });
    mockExportAdminUsageMembersCsv.mockResolvedValue({
      data: new Blob(['members']),
      headers: {
        'x-export-truncated': 'false',
        'x-export-limit': '10000',
      },
    });
    mockGetAdminTransactionsExportCount.mockResolvedValue({
      count: 1,
      limit: 10000,
    });
    mockGetAdminUsageMembersExportCount.mockResolvedValue({
      count: 1,
      limit: 10000,
    });
    mockUseGetAdminTransactionsQuery.mockReturnValue({
      data: {
        transactions: [
          {
            id: 'transaction-1',
            userId: 'user-1',
            userEmail: 'user@example.com',
            userName: 'Usage User',
            conversationId: 'conversation-1',
            tokenType: 'prompt',
            model: 'gpt-4o',
            context: 'chat',
            rawAmount: 123,
            tokenValue: 456,
            rate: 2.5,
            rateDetail: {
              input: 2.5,
              write: 1.25,
              read: 0.25,
            },
            inputTokens: 1000,
            writeTokens: 50,
            readTokens: 25,
            createdAt: '2026-03-27T01:00:00.000Z',
          },
        ],
        nextCursor: null,
      },
      isLoading: false,
      error: undefined,
    });
    mockUseGetAdminUsageSummaryQuery.mockReturnValue({
      data: {
        transactionCount: 1,
        uniqueUsers: 1,
        totalTokenValue: 456,
        totalRawAmount: 123,
        totalInputTokens: 1000,
        totalWriteTokens: 50,
        totalReadTokens: 25,
        newestTransactionAt: '2026-03-27T01:00:00.000Z',
        oldestTransactionAt: '2026-03-27T01:00:00.000Z',
      },
      isLoading: false,
      error: undefined,
    });
    mockUseGetAdminUsageMembersQuery.mockReturnValue({
      data: {
        members: [
          {
            userId: 'member-1',
            userEmail: 'member@example.com',
            userName: 'Usage Member',
            transactionCount: 3,
            totalTokenValue: 789,
            totalRawAmount: 321,
            totalInputTokens: 1200,
            totalWriteTokens: 70,
            totalReadTokens: 30,
            totalTokens: 1300,
            newestTransactionAt: '2026-03-27T02:00:00.000Z',
          },
        ],
        nextCursor: 'member-cursor-2',
      },
      isLoading: false,
      error: undefined,
    });
    mockUseGetAdminDepartmentsQuery.mockReturnValue({
      data: {
        departments: [
          {
            id: 'department-1',
            code: 'IT',
            name: 'Information Technology',
          },
        ],
      },
      isLoading: false,
      error: undefined,
    });
  });

  it('renders usage summary and transaction table content', () => {
    render(<AdminUsagePage />);

    expect(screen.getAllByText('com_ui_admin_usage').length).toBeGreaterThan(0);
    expect(screen.getByText('Usage User')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getAllByText('456').length).toBeGreaterThan(0);
    expect(screen.getByText('input: 2.5 / write: 1.25 / read: 0.25')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_usage_members_title' }));

    expect(screen.getByText('Usage Member')).toBeInTheDocument();
  });

  it('paginates member usage independently from transaction records', () => {
    render(<AdminUsagePage />);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_usage_members_title' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_next_page' }));

    expect(mockUseGetAdminUsageMembersQuery).toHaveBeenLastCalledWith({
      departmentId: undefined,
      userId: undefined,
      model: undefined,
      context: undefined,
      tokenType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      cursor: 'member-cursor-2',
      limit: 10,
    });
    expect(mockUseGetAdminTransactionsQuery).toHaveBeenLastCalledWith({
      departmentId: undefined,
      userId: undefined,
      model: undefined,
      context: undefined,
      tokenType: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      cursor: undefined,
      limit: 20,
    });
  });

  it('exports csv for the active usage view with the shared filters', async () => {
    render(<AdminUsagePage />);

    fireEvent.change(screen.getByPlaceholderText('com_ui_model'), {
      target: { value: 'gpt-4o' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_export_csv' }));

    await waitFor(() => {
      expect(mockGetAdminTransactionsExportCount).toHaveBeenLastCalledWith({
        departmentId: undefined,
        userId: undefined,
        model: 'gpt-4o',
        context: undefined,
        tokenType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
      expect(mockExportAdminTransactionsCsv).toHaveBeenLastCalledWith({
        departmentId: undefined,
        userId: undefined,
        model: 'gpt-4o',
        context: undefined,
        tokenType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });
    await screen.findByRole('button', { name: 'com_ui_admin_export_csv' });

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_usage_members_title' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_export_csv' }));

    await waitFor(() => {
      expect(mockExportAdminUsageMembersCsv).toHaveBeenLastCalledWith({
        departmentId: undefined,
        userId: undefined,
        model: 'gpt-4o',
        context: undefined,
        tokenType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });
  });

  it('confirms before exporting when the row count exceeds the export limit', async () => {
    mockGetAdminTransactionsExportCount.mockResolvedValue({
      count: 20,
      limit: 19,
    });

    render(<AdminUsagePage />);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_admin_export_csv' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'com_ui_admin_export_limit_confirm:19:20',
    );
    expect(mockExportAdminTransactionsCsv).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'com_ui_close' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_continue' }));

    await waitFor(() => {
      expect(mockExportAdminTransactionsCsv).toHaveBeenCalledTimes(1);
    });
  });

  it('passes shared filters to summary and paginated filters to transactions', () => {
    render(<AdminUsagePage />);

    fireEvent.change(screen.getByLabelText('com_ui_admin_department'), {
      target: { value: 'department-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('com_ui_admin_user_id_placeholder'), {
      target: { value: '507f1f77bcf86cd799439011' },
    });
    fireEvent.change(screen.getByPlaceholderText('com_ui_model'), {
      target: { value: 'gpt-4o' },
    });
    fireEvent.change(screen.getByPlaceholderText('com_ui_context'), {
      target: { value: 'chat' },
    });
    fireEvent.change(screen.getByLabelText('com_ui_admin_token_type'), {
      target: { value: 'prompt' },
    });

    expect(mockUseGetAdminUsageSummaryQuery).toHaveBeenLastCalledWith({
      departmentId: 'department-1',
      userId: '507f1f77bcf86cd799439011',
      model: 'gpt-4o',
      context: 'chat',
      tokenType: 'prompt',
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(mockUseGetAdminTransactionsQuery).toHaveBeenLastCalledWith({
      departmentId: 'department-1',
      userId: '507f1f77bcf86cd799439011',
      model: 'gpt-4o',
      context: 'chat',
      tokenType: 'prompt',
      dateFrom: undefined,
      dateTo: undefined,
      cursor: undefined,
      limit: 20,
    });
    expect(mockUseGetAdminUsageMembersQuery).toHaveBeenLastCalledWith({
      departmentId: 'department-1',
      userId: '507f1f77bcf86cd799439011',
      model: 'gpt-4o',
      context: 'chat',
      tokenType: 'prompt',
      dateFrom: undefined,
      dateTo: undefined,
      cursor: undefined,
      limit: 10,
    });
  });
});
