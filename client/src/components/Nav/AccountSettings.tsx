import { useEffect, useState, memo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Menu from '@ariakit/react/menu';
import { Coins, FileText, LogOut, Shield } from 'lucide-react';
import {
  LinkIcon,
  GearIcon,
  DropdownMenuSeparator,
  Avatar,
  useToastContext,
} from '@librechat/client';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { canAccessAdminConsole, getAdminConsoleDefaultPath } from '~/components/Admin/adminAccess';
import {
  useGetStartupConfig,
  useGetUserBalance,
  useGetUserQuotaRequestsQuery,
} from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import QuotaBar from './QuotaBar';
import Settings from './Settings';

function AccountSettings() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const legacyBalanceEnabled = startupConfig?.legacyBalanceEnabled === true;
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated,
  });
  const pendingQuotaRequestsQuery = useGetUserQuotaRequestsQuery(
    { status: 'pending', limit: 3 },
    {
      enabled: !!isAuthenticated && balanceQuery.data?.quota != null,
    },
  );
  const recentQuotaRequestsQuery = useGetUserQuotaRequestsQuery(
    { status: 'all', limit: 5 },
    {
      enabled: !!isAuthenticated,
      refetchInterval: 30000,
      refetchOnWindowFocus: true,
    },
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const adminConsolePath = getAdminConsoleDefaultPath(user?.role);
  const quota = balanceQuery.data?.quota;
  const hasInactiveQuotaPeriod = balanceQuery.data?.quotaState?.status === 'inactive_period';
  const pendingQuotaRequestCount = pendingQuotaRequestsQuery.data?.requests.length ?? 0;
  const latestReviewedQuotaRequest =
    recentQuotaRequestsQuery.data?.requests.find(
      (request) => request.status === 'approved' || request.status === 'rejected',
    ) ?? null;

  useEffect(() => {
    if (!latestReviewedQuotaRequest) {
      return;
    }

    const storageKey = `quota-request-notice:${latestReviewedQuotaRequest.id}:${latestReviewedQuotaRequest.status}`;
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === 'true') {
      return;
    }

    if (latestReviewedQuotaRequest.status === 'approved') {
      showToast({
        status: 'success',
        message: localize('com_nav_quota_request_approved_notice', {
          0: new Intl.NumberFormat().format(latestReviewedQuotaRequest.amount),
        }),
      });
      balanceQuery.refetch();
    } else if (latestReviewedQuotaRequest.status === 'rejected') {
      showToast({
        status: 'warning',
        message: localize('com_nav_quota_request_rejected_notice'),
      });
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, 'true');
    }
  }, [balanceQuery, latestReviewedQuotaRequest, localize, showToast]);

  return (
    <Menu.MenuProvider>
      <Menu.MenuButton
        ref={accountSettingsButtonRef}
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <Avatar user={user} size={32} />
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </div>
      </Menu.MenuButton>
      <Menu.Menu
        className="account-settings-popover popover-ui z-[125] w-[305px] rounded-lg md:w-[244px]"
        style={{
          transformOrigin: 'bottom',
          translate: '0 -4px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {balanceQuery.data != null && (
          <>
            {quota != null && (
              <>
                <QuotaBar
                  periodTotalCredits={quota.periodTotalCredits}
                  periodUsedCredits={quota.periodUsedCredits}
                  periodRemainingCredits={quota.periodRemainingCredits}
                  usageRatio={quota.usageRatio}
                />
                <div className="mx-3 mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-active"
                    onClick={() => navigate('/d/quota')}
                  >
                    <Coins className="h-4 w-4" aria-hidden="true" />
                    {localize('com_nav_quota_dashboard')}
                  </button>
                  {pendingQuotaRequestCount > 0 && (
                    <span className="text-xs text-text-secondary">
                      {localize('com_nav_quota_pending_requests', {
                        0: pendingQuotaRequestCount,
                      })}
                    </span>
                  )}
                </div>
                {latestReviewedQuotaRequest ? (
                  <div className="mx-3 mb-2 rounded-xl border border-border-medium bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
                    {latestReviewedQuotaRequest.status === 'approved'
                      ? localize('com_nav_quota_request_approved_notice', {
                          0: new Intl.NumberFormat().format(latestReviewedQuotaRequest.amount),
                        })
                      : localize('com_nav_quota_request_rejected_notice')}
                  </div>
                ) : null}
              </>
            )}
            {quota == null && hasInactiveQuotaPeriod && (
              <div className="text-token-text-secondary mx-3 my-2 rounded-xl border border-border-medium bg-surface-secondary px-3 py-3 text-sm">
                {localize('com_nav_quota_request_no_active_period')}
              </div>
            )}
            {legacyBalanceEnabled && quota == null && !hasInactiveQuotaPeriod && (
              <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
                {localize('com_nav_balance')}:{' '}
                {new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))}
              </div>
            )}
            {quota == null && (
              <div className="mx-3 mb-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-active"
                  onClick={() => navigate('/d/quota')}
                >
                  <Coins className="h-4 w-4" aria-hidden="true" />
                  {localize('com_nav_quota_dashboard')}
                </button>
              </div>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <Menu.MenuItem onClick={() => setShowFiles(true)} className="select-item text-sm">
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Menu.MenuItem>
        {startupConfig?.helpAndFaqURL !== '/' && (
          <Menu.MenuItem
            onClick={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
            className="select-item text-sm"
          >
            <LinkIcon aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Menu.MenuItem>
        )}
        <Menu.MenuItem onClick={() => setShowSettings(true)} className="select-item text-sm">
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Menu.MenuItem>
        {canAccessAdminConsole(user?.role) && (
          <Menu.MenuItem onClick={() => navigate(adminConsolePath)} className="select-item text-sm">
            <Shield className="icon-md" aria-hidden="true" />
            {localize('com_ui_admin_console')}
          </Menu.MenuItem>
        )}
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className="select-item text-sm">
          <LogOut className="icon-md" aria-hidden="true" />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      {showFiles && (
        <MyFilesModal
          open={showFiles}
          onOpenChange={setShowFiles}
          triggerRef={accountSettingsButtonRef}
        />
      )}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
