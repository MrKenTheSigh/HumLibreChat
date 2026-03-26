import { render, screen } from '@testing-library/react';
import type * as t from 'librechat-data-provider';
import AdminChannelsPage from '../AdminChannelsPage';

const mockNavigate = jest.fn();
const mockUseGetAdminChannelsQuery = jest.fn();

jest.mock('~/data-provider/Admin', () => ({
  useGetAdminChannelsQuery: (...args: unknown[]) => mockUseGetAdminChannelsQuery(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('AdminChannelsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the channels list', async () => {
    mockUseGetAdminChannelsQuery.mockReturnValue({
      data: {
        channels: [
          {
            id: 'channel-1',
            name: 'Azure Premium',
            slug: 'azure-premium',
            description: 'High-capability Azure options',
            enabled: true,
            sortOrder: 10,
            icon: 'shield',
            entries: [
              {
                endpoint: 'azureOpenAI',
                model: 'gpt-4o',
                label: 'Azure GPT-4o',
                enabled: true,
                defaultParameters: null,
              },
            ],
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T01:00:00.000Z',
          } satisfies t.AdminChannel,
        ],
      },
      isLoading: false,
    });

    render(<AdminChannelsPage />);

    expect(screen.getByText('Azure Premium')).toBeInTheDocument();
    expect(screen.getByText('azure-premium')).toBeInTheDocument();
    expect(screen.getByText('com_ui_admin_enabled')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
