const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

async function summarizePeriod({ QuotaAccount, QuotaLedgerEntry }, period) {
  const [accounts, ledgerEntries] = await Promise.all([
    QuotaAccount.countDocuments({ periodId: period._id }),
    QuotaLedgerEntry.countDocuments({ periodId: period._id }),
  ]);

  return {
    id: period._id.toString(),
    periodKey: period.periodKey,
    status: period.status,
    periodStart: period.periodStart?.toISOString() ?? null,
    periodEnd: period.periodEnd?.toISOString() ?? null,
    billingDay: period.closePolicy?.billingDay ?? null,
    accounts,
    ledgerEntries,
  };
}

async function run() {
  await connect();

  const models = createModels(mongoose);
  const periods = await models.QuotaPeriod.find({})
    .sort({ periodStart: 1, _id: 1 })
    .lean();
  const summaries = [];

  for (const period of periods) {
    summaries.push(await summarizePeriod(models, period));
  }

  const duplicateKeys = Object.entries(
    summaries.reduce((accumulator, period) => {
      accumulator[period.periodKey] = (accumulator[period.periodKey] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .filter(([, count]) => count > 1)
    .map(([periodKey, count]) => ({ periodKey, count }));

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        quotaMonthStartDay: process.env.QUOTA_MONTH_START_DAY ?? '1',
        count: summaries.length,
        duplicateKeys,
        periods: summaries,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };
