const { getBalanceConfig } = require('@librechat/api');
const { Balance, Department, QuotaAccount, QuotaPeriod, User } = require('~/db/models');

const COMPANY_DEPARTMENT_CODE = 'COMPANY';

function getAccountLimitCredits(account) {
  return (account.baseAllocatedCredits ?? 0) + (account.extraGrantedCredits ?? 0);
}

function buildQuotaSummary({ tokenCredits, periodTotalCredits }) {
  if (typeof periodTotalCredits !== 'number' || periodTotalCredits <= 0) {
    return undefined;
  }

  const periodRemainingCredits = Math.max(tokenCredits, 0);
  const normalizedTotal = Math.max(periodTotalCredits, 0);
  const normalizedRemaining = Math.min(periodRemainingCredits, normalizedTotal);
  const periodUsedCredits = Math.max(normalizedTotal - normalizedRemaining, 0);
  const usageRatio = normalizedTotal === 0 ? 0 : periodUsedCredits / normalizedTotal;

  return {
    periodTotalCredits: normalizedTotal,
    periodUsedCredits,
    periodRemainingCredits: normalizedRemaining,
    usageRatio,
    resetAt: null,
  };
}

function buildQuotaAccountSummary({ account, period }) {
  const periodTotalCredits = getAccountLimitCredits(account);
  if (periodTotalCredits <= 0) {
    return undefined;
  }

  const periodUsedCredits = Math.max(account.usedCredits ?? 0, 0);
  const periodRemainingCredits = Math.max(
    periodTotalCredits + (account.bufferCredits ?? 0) - periodUsedCredits,
    0,
  );
  const usageRatio = periodTotalCredits === 0 ? 0 : periodUsedCredits / periodTotalCredits;

  return {
    periodId: period._id.toString(),
    quotaAccountId: account._id.toString(),
    periodTotalCredits,
    periodUsedCredits,
    periodRemainingCredits,
    usageRatio,
    resetAt: period.periodEnd?.toISOString?.() ?? null,
  };
}

async function getActiveQuotaPeriod(now = new Date()) {
  return QuotaPeriod.findOne({
    status: 'active',
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean();
}

async function getCurrentQuotaPeriod(now = new Date()) {
  return QuotaPeriod.findOne({
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean();
}

async function isCompanyRootDepartment(departmentId) {
  const department = await Department.findById(departmentId).select('_id code').lean();

  return department?.code?.trim().toUpperCase() === COMPANY_DEPARTMENT_CODE;
}

async function findUserQuotaAccount({ periodId, userId }) {
  const userAccount = await QuotaAccount.findOne({
    periodId,
    scopeType: 'user',
    scopeId: userId,
  }).lean();

  if (userAccount) {
    return userAccount;
  }

  const user = await User.findById(userId).select('_id departmentId').lean();
  const departmentId = user?.departmentId?.toString();
  if (!departmentId) {
    return null;
  }

  if (await isCompanyRootDepartment(departmentId)) {
    return QuotaAccount.findOne({
      periodId,
      scopeType: 'company',
      scopeId: 'company',
    }).lean();
  }

  return QuotaAccount.findOne({
    periodId,
    scopeType: 'department',
    scopeId: departmentId,
  }).lean();
}

async function resolveActiveQuotaSummary(userId) {
  const period = await getActiveQuotaPeriod();
  if (!period) {
    return undefined;
  }

  const account = await findUserQuotaAccount({ periodId: period._id, userId });
  if (!account) {
    return undefined;
  }

  return buildQuotaAccountSummary({ account, period });
}

function resolvePeriodTotalCredits(req, balanceData) {
  if (typeof balanceData?.tokenCreditsLimit === 'number' && balanceData.tokenCreditsLimit > 0) {
    return balanceData.tokenCreditsLimit;
  }

  const balanceConfig = getBalanceConfig(req.config);
  if (typeof balanceConfig?.startBalance === 'number') {
    return balanceConfig.startBalance;
  }

  return null;
}

async function balanceController(req, res) {
  const balanceConfig = getBalanceConfig(req.config);
  const legacyBalanceEnabled = balanceConfig?.enabled === true;
  const balanceData = await Balance.findOne(
    { user: req.user.id },
    '-_id tokenCredits tokenCreditsLimit autoRefillEnabled refillIntervalValue refillIntervalUnit lastRefill refillAmount',
  ).lean();

  if (!balanceData && legacyBalanceEnabled) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  const responseData =
    legacyBalanceEnabled && balanceData
      ? balanceData
      : {
          tokenCredits: 0,
          tokenCreditsLimit: 0,
          autoRefillEnabled: false,
        };

  // If auto-refill is not enabled, remove auto-refill related fields from the response
  if (!responseData.autoRefillEnabled) {
    delete responseData.refillIntervalValue;
    delete responseData.refillIntervalUnit;
    delete responseData.lastRefill;
    delete responseData.refillAmount;
  }

  const quota = await resolveActiveQuotaSummary(req.user.id);

  if (!quota) {
    const currentQuotaPeriod = await getCurrentQuotaPeriod();
    if (currentQuotaPeriod && currentQuotaPeriod.status !== 'active') {
      responseData.quotaState = {
        status: 'inactive_period',
        periodId: currentQuotaPeriod._id.toString(),
        periodKey: currentQuotaPeriod.periodKey ?? null,
        periodStatus: currentQuotaPeriod.status,
      };
    }
  }

  const resolvedQuota =
    quota ??
    (responseData.quotaState || !legacyBalanceEnabled
      ? undefined
      : buildQuotaSummary({
          tokenCredits: responseData.tokenCredits,
          periodTotalCredits: resolvePeriodTotalCredits(req, responseData),
        }));

  if (resolvedQuota != null) {
    responseData.quota = resolvedQuota;
  }

  res.status(200).json(responseData);
}

module.exports = balanceController;
