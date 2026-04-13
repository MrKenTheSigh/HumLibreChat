import { memo } from 'react';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import QuotaBar from '~/components/Nav/QuotaBar';

function ChatQuotaBar() {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled === true,
  });

  const quota = balanceQuery.data?.quota;

  if (startupConfig?.balance?.enabled !== true || quota == null) {
    return null;
  }

  return (
    <div className="w-full px-2 pt-2 md:px-4">
      <QuotaBar
        className="mx-auto my-0 w-full max-w-5xl"
        periodTotalCredits={quota.periodTotalCredits}
        periodUsedCredits={quota.periodUsedCredits}
        periodRemainingCredits={quota.periodRemainingCredits}
        usageRatio={quota.usageRatio}
      />
    </div>
  );
}

export default memo(ChatQuotaBar);
