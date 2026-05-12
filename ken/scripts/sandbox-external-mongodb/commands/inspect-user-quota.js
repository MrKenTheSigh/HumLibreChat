const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

function serializeDocument(document) {
  return document == null ? null : JSON.parse(JSON.stringify(document));
}

async function run() {
  const usernameOrEmail = process.argv[3] || 'minion01_01';

  await connect();

  const models = createModels(mongoose);
  const user = await models.User.findOne({
    $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }, { name: usernameOrEmail }],
  })
    .select('_id username email name role departmentId')
    .lean();

  if (!user) {
    console.log(JSON.stringify({ found: false, usernameOrEmail }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const matchingPeriods = await models.QuotaPeriod.find({
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
  })
    .sort({ periodStart: -1, _id: -1 })
    .lean();
  const activePeriod = matchingPeriods.find((period) => period.status === 'active') ?? null;
  const diagnosticPeriod = activePeriod ?? matchingPeriods[0] ?? null;
  const matchingPeriodIds = matchingPeriods.map((period) => period._id);
  const matchingPeriodAccounts =
    matchingPeriodIds.length > 0
      ? await models.QuotaAccount.find({
          periodId: { $in: matchingPeriodIds },
          scopeType: 'user',
          scopeId: user._id.toString(),
        })
          .sort({ createdAt: -1, _id: -1 })
          .lean()
      : [];
  const matchingPeriodRequests =
    matchingPeriodIds.length > 0
      ? await models.QuotaRequest.find({
          periodId: { $in: matchingPeriodIds },
          requestedByUserId: user._id,
        })
          .sort({ createdAt: -1, _id: -1 })
          .limit(10)
          .lean()
      : [];
  const department = user.departmentId
    ? await models.Department.findById(user.departmentId)
        .select('_id code name parentDepartmentId enabled')
        .lean()
    : null;
  const balance = await models.Balance.findOne({ user: user._id })
    .select('tokenCredits tokenCreditsLimit planTokenCredits planTokenCreditsLimit')
    .lean();
  const quotaAccounts = diagnosticPeriod
    ? await models.QuotaAccount.find({
        periodId: diagnosticPeriod._id,
        $or: [
          { scopeType: 'user', scopeId: user._id.toString() },
          ...(department ? [{ scopeType: 'department', scopeId: department._id.toString() }] : []),
          { scopeType: 'company', scopeId: 'company' },
        ],
      })
        .sort({ scopeType: 1, scopeId: 1 })
        .lean()
    : [];
  const accountIds = quotaAccounts.map((account) => account._id);
  const parentAccounts =
    quotaAccounts.length > 0
      ? await models.QuotaAccount.find({
          _id: {
            $in: quotaAccounts
              .map((account) => account.parentAccountId)
              .filter((id) => id != null),
          },
        }).lean()
      : [];
  const requests = diagnosticPeriod
    ? await models.QuotaRequest.find({
        periodId: diagnosticPeriod._id,
        $or: [{ requestedByUserId: user._id }, { targetAccountId: { $in: accountIds } }],
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(10)
        .lean()
    : [];

  console.log(
    JSON.stringify(
      {
        found: true,
        checkedAt: now.toISOString(),
        user: serializeDocument(user),
        department: serializeDocument(department),
        balance: serializeDocument(balance),
        activePeriod: serializeDocument(activePeriod),
        matchingPeriods: serializeDocument(matchingPeriods),
        diagnosticPeriod: serializeDocument(diagnosticPeriod),
        quotaAccounts: serializeDocument(quotaAccounts),
        matchingPeriodUserAccounts: serializeDocument(matchingPeriodAccounts),
        parentAccounts: serializeDocument(parentAccounts),
        requests: serializeDocument(requests),
        matchingPeriodRequests: serializeDocument(matchingPeriodRequests),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };
