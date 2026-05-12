const { checkQuotaAvailability } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { getMultiplier } = require('./tx');

const checkQuotaBalance = async ({ req, res, txData }) => {
  const multiplier = getMultiplier({
    valueKey: txData.valueKey,
    tokenType: txData.tokenType,
    model: txData.model,
    endpoint: txData.endpoint,
    endpointTokenConfig: txData.endpointTokenConfig,
  });
  const tokenCost = txData.amount * multiplier;
  const quotaAvailability = await checkQuotaAvailability({
    userId: txData.user,
    estimatedCredits: tokenCost,
  });

  if (quotaAvailability.canSpend) {
    return true;
  }

  const type = ViolationTypes.TOKEN_BALANCE;
  const errorMessage = {
    type,
    tokenCost,
    promptTokens: txData.amount,
    quotaAccountId: quotaAvailability.accountId,
    quotaScopeType: quotaAvailability.scopeType,
    quotaRemainingCredits: quotaAvailability.remainingCredits,
  };

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  const { logViolation } = require('~/cache');
  await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
};

module.exports = {
  checkQuotaBalance,
};
