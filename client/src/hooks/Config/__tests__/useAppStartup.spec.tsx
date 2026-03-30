import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook } from '@testing-library/react';
import { LocalStorageKeys, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';

const mockUseHasAccess = jest.fn();
const mockUseMCPServersQuery = jest.fn();
const mockUseMCPToolsQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useHasAccess: (args: unknown) => mockUseHasAccess(args),
}));

jest.mock('~/data-provider', () => ({
  useMCPServersQuery: (config: unknown) => mockUseMCPServersQuery(config),
  useMCPToolsQuery: (config: unknown) => mockUseMCPToolsQuery(config),
}));

jest.mock('../useSpeechSettingsInit', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/utils/timestamps', () => ({
  cleanupTimestampedStorage: jest.fn(),
}));

jest.mock('react-gtm-module', () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
}));

import useAppStartup from '../useAppStartup';

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  emailVerified: true,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
} as TUser;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useAppStartup — MCP permission gating', () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = 'LibreChat';
    document.head.innerHTML = `
      <link rel="icon" href="assets/favicon-32x32.png" />
      <link rel="apple-touch-icon" href="assets/apple-touch-icon-180x180.png" />
    `;
    mockUseMCPServersQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseMCPToolsQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('checks the MCP_SERVERS.USE permission via useHasAccess', () => {
    mockUseHasAccess.mockReturnValue(false);

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseHasAccess).toHaveBeenCalledWith({
      permissionType: PermissionTypes.MCP_SERVERS,
      permission: Permissions.USE,
    });
  });

  it('suppresses all MCP queries when user lacks MCP_SERVERS.USE', () => {
    mockUseHasAccess.mockReturnValue(false);

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: false });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('enables servers query and tools query when permission granted, servers loaded, and user present', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({
      data: { 'test-server': { url: 'http://test' } },
      isLoading: false,
    });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: true });
  });

  it('suppresses tools query when permission granted but user prop is undefined', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({
      data: { 'test-server': { url: 'http://test' } },
      isLoading: false,
    });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: undefined }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('suppresses tools query when permission granted but no servers loaded', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({ data: {}, isLoading: false });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPServersQuery).toHaveBeenCalledWith({ enabled: true });
    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('suppresses tools query while servers are still loading', () => {
    mockUseHasAccess.mockReturnValue(true);
    mockUseMCPServersQuery.mockReturnValue({ data: undefined, isLoading: true });

    renderHook(() => useAppStartup({ startupConfig: undefined, user: mockUser }), { wrapper });

    expect(mockUseMCPToolsQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('applies app title and app icon from startup config', () => {
    mockUseHasAccess.mockReturnValue(false);

    renderHook(
      () =>
        useAppStartup({
          startupConfig: {
            appTitle: 'HumLibreChat',
            appIcon: '/assets/hum-icon.png',
            discordLoginEnabled: false,
            facebookLoginEnabled: false,
            githubLoginEnabled: false,
            googleLoginEnabled: false,
            openidLoginEnabled: false,
            appleLoginEnabled: false,
            samlLoginEnabled: false,
            openidLabel: 'Continue with OpenID',
            openidImageUrl: '',
            openidAutoRedirect: false,
            samlLabel: '',
            samlImageUrl: '',
            serverDomain: 'http://localhost:3080',
            emailLoginEnabled: true,
            registrationEnabled: true,
            socialLoginEnabled: false,
            passwordResetEnabled: true,
            emailEnabled: false,
            showBirthdayIcon: false,
            helpAndFaqURL: 'https://librechat.ai',
          },
          user: mockUser,
        }),
      { wrapper },
    );

    expect(document.title).toBe('HumLibreChat');
    expect(localStorage.getItem(LocalStorageKeys.APP_TITLE)).toBe('HumLibreChat');
    expect(localStorage.getItem(LocalStorageKeys.APP_ICON)).toBe('/assets/hum-icon.png');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(
      'http://localhost/assets/hum-icon.png',
    );
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe(
      'http://localhost/assets/hum-icon.png',
    );
  });
});
