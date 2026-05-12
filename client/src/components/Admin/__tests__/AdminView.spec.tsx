import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AdminView from '../AdminView';

const mockUseAuthContext = jest.fn();
const mockUseGetAdminQuotaRequestsQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockUseAuthContext(),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminQuotaRequestsQuery: (...args: unknown[]) => mockUseGetAdminQuotaRequestsQuery(...args),
}));

function renderAdminView(path = '/d/admin/org-graph') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Routes>
        <Route path="/d/admin/*" element={<AdminView />}>
          <Route path="org-graph" element={<div data-testid="org-graph-outlet" />} />
          <Route path="conversations" element={<div data-testid="conversations-outlet" />} />
        </Route>
        <Route path="/c/new" element={<div data-testid="chat-outlet" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.MANAGER },
    });
    mockUseGetAdminQuotaRequestsQuery.mockReturnValue({
      data: { requests: [{ id: 'request-1' }, { id: 'request-2' }] },
    });
  });

  it('shows a pending quota request badge on organization graph for managers', () => {
    renderAdminView();

    expect(screen.getByText('com_ui_admin_org_graph')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(mockUseGetAdminQuotaRequestsQuery).toHaveBeenCalledWith(
      { status: 'pending', limit: 100 },
      expect.objectContaining({
        enabled: true,
        refetchInterval: 30000,
      }),
    );
  });

  it('does not query quota review badges for auditors', () => {
    mockUseAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { role: SystemRoles.AUDITOR },
    });
    mockUseGetAdminQuotaRequestsQuery.mockReturnValue({
      data: { requests: [{ id: 'request-1' }] },
    });

    renderAdminView('/d/admin/conversations');

    expect(screen.getByText('com_ui_admin_org_graph')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(mockUseGetAdminQuotaRequestsQuery).toHaveBeenCalledWith(
      { status: 'pending', limit: 100 },
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('redirects managers away from admin-only routes', () => {
    renderAdminView('/d/admin/users');

    expect(screen.getByTestId('org-graph-outlet')).toBeInTheDocument();
  });
});
