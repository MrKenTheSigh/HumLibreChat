import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserQuotaDashboard from '../UserQuotaDashboard';

const mockShowToast = jest.fn();
const mockMutate = jest.fn();
const mockUseGetUserQuotaRequestsQuery = jest.fn();

jest.mock('@librechat/client', () => ({
  OGDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogOverlay: () => null,
  OGDialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OGDialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Nav/QuotaBar', () => ({
  __esModule: true,
  default: () => <div data-testid="quota-bar" />,
}));

jest.mock('~/data-provider', () => ({
  useCreateUserQuotaRequestMutation: () => ({
    isLoading: false,
    mutate: mockMutate,
  }),
  useGetStartupConfig: () => ({
    data: { balance: { enabled: true } },
  }),
  useGetUserBalance: () => ({
    data: {
      quota: {
        periodTotalCredits: 1000,
        periodUsedCredits: 200,
        periodRemainingCredits: 800,
        usageRatio: 0.2,
      },
    },
  }),
  useGetUserQuotaRequestsQuery: (...args: unknown[]) => mockUseGetUserQuotaRequestsQuery(...args),
}));

const pendingRequest = {
  id: 'request-pending',
  amount: 100,
  reason: 'Need more quota',
  reviewReason: '',
  status: 'pending',
  requestedAt: '2026-05-01T00:00:00.000Z',
  reviewedAt: null,
};

const approvedRequest = {
  id: 'request-approved',
  amount: 50,
  reason: 'Approved quota',
  reviewReason: 'OK',
  status: 'approved',
  requestedAt: '2026-05-02T00:00:00.000Z',
  reviewedAt: '2026-05-03T00:00:00.000Z',
};

function renderDashboard() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <UserQuotaDashboard />
    </MemoryRouter>,
  );
}

describe('UserQuotaDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetUserQuotaRequestsQuery.mockImplementation((params: { status: string }) => {
      if (params.status === 'pending') {
        return { data: { requests: [pendingRequest], nextCursor: null }, isLoading: false };
      }

      return {
        data: { requests: [pendingRequest, approvedRequest], nextCursor: 'next-cursor' },
        isLoading: false,
      };
    });
  });

  it('uses page-specific pagination labels', () => {
    renderDashboard();

    expect(screen.getByRole('button', { name: 'com_nav_quota_prev_page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_nav_quota_next_page' })).toBeInTheDocument();
  });

  it('filters requests by status', () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_quota_request_status_approved' }));

    expect(mockUseGetUserQuotaRequestsQuery).toHaveBeenCalledWith(
      { status: 'approved', cursor: undefined, limit: 10 },
      { enabled: true },
    );
  });

  it('shows a readable message when a pending request already exists', async () => {
    mockMutate.mockImplementation((_payload, callbacks) => {
      callbacks.onError({
        response: {
          status: 409,
          data: { message: 'A quota request is already pending' },
        },
      });
    });

    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_quota_request' }));
    fireEvent.change(screen.getByLabelText('com_nav_quota_request_amount'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('com_nav_quota_request_reason'), {
      target: { value: 'Need more quota' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_quota_submit_request' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        status: 'warning',
        message: 'com_nav_quota_request_pending_exists',
      });
    });
  });

  it('clears the request modal after successful submit', async () => {
    mockMutate.mockImplementation((_payload, callbacks) => {
      callbacks.onSuccess();
    });

    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_quota_request' }));
    fireEvent.change(screen.getByLabelText('com_nav_quota_request_amount'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('com_nav_quota_request_reason'), {
      target: { value: 'Need quota for test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_quota_submit_request' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        status: 'success',
        message: 'com_nav_quota_request_success',
      });
    });
    expect(screen.queryByLabelText('com_nav_quota_request_amount')).not.toBeInTheDocument();
  });
});
