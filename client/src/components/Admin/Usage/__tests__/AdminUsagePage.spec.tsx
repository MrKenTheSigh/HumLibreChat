import { fireEvent, render, screen } from '@testing-library/react';
import AdminUsagePage from '../AdminUsagePage';

const mockUseGetAdminTransactionsQuery = jest.fn();
const mockUseGetAdminUsageSummaryQuery = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminTransactionsQuery: (...args: unknown[]) => mockUseGetAdminTransactionsQuery(...args),
  useGetAdminUsageSummaryQuery: (...args: unknown[]) => mockUseGetAdminUsageSummaryQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('AdminUsagePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it('renders usage summary and transaction table content', () => {
    render(<AdminUsagePage />);

    expect(screen.getByText('com_ui_admin_usage')).toBeInTheDocument();
    expect(screen.getByText('Usage User')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getAllByText('456').length).toBeGreaterThan(0);
    expect(screen.getByText('input: 2.5 / write: 1.25 / read: 0.25')).toBeInTheDocument();
  });

  it('passes shared filters to summary and paginated filters to transactions', () => {
    render(<AdminUsagePage />);

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
      userId: '507f1f77bcf86cd799439011',
      model: 'gpt-4o',
      context: 'chat',
      tokenType: 'prompt',
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(mockUseGetAdminTransactionsQuery).toHaveBeenLastCalledWith({
      userId: '507f1f77bcf86cd799439011',
      model: 'gpt-4o',
      context: 'chat',
      tokenType: 'prompt',
      dateFrom: undefined,
      dateTo: undefined,
      cursor: undefined,
      limit: 20,
    });
  });
});
