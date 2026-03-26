import { render, screen } from 'test/layout-test-utils';
import { useGetAdminPlansQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';
import AdminPlansPage from '../AdminPlansPage';

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminPlansQuery: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(),
}));

const mockUseGetAdminPlansQuery = useGetAdminPlansQuery as jest.MockedFunction<
  typeof useGetAdminPlansQuery
>;
const mockUseLocalize = useLocalize as jest.MockedFunction<typeof useLocalize>;

describe('AdminPlansPage', () => {
  beforeEach(() => {
    mockUseLocalize.mockReturnValue((key: string) => key);
    mockUseGetAdminPlansQuery.mockReturnValue({
      isLoading: false,
      data: {
        plans: [
          {
            id: 'plan-1',
            name: 'Pro',
            slug: 'pro',
            description: 'Power users',
            enabled: true,
            isDefault: true,
            sortOrder: 20,
            channelIds: ['channel-1', 'channel-2'],
            notes: '',
            startingCredits: 20000,
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          },
        ],
      },
    } as ReturnType<typeof useGetAdminPlansQuery>);
  });

  it('renders plan list content', () => {
    render(<AdminPlansPage />);

    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_default_plan')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
