const { getBalanceConfig } = require('@librechat/api');
const { Balance } = require('~/db/models');

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
  const balanceData = await Balance.findOne(
    { user: req.user.id },
    '-_id tokenCredits tokenCreditsLimit autoRefillEnabled refillIntervalValue refillIntervalUnit lastRefill refillAmount',
  ).lean();

  if (!balanceData) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  // If auto-refill is not enabled, remove auto-refill related fields from the response
  if (!balanceData.autoRefillEnabled) {
    delete balanceData.refillIntervalValue;
    delete balanceData.refillIntervalUnit;
    delete balanceData.lastRefill;
    delete balanceData.refillAmount;
  }

  const periodTotalCredits = resolvePeriodTotalCredits(req, balanceData);
  const quota = buildQuotaSummary({
    tokenCredits: balanceData.tokenCredits,
    periodTotalCredits,
  });

  if (quota != null) {
    balanceData.quota = quota;
  }

  res.status(200).json(balanceData);
}

module.exports = balanceController;
