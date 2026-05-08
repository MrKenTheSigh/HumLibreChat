const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

const quotaCollections = [
  'QuotaLedgerEntry',
  'QuotaGrant',
  'QuotaAllocation',
  'QuotaAccount',
  'QuotaPeriod',
];

async function countDocuments(models) {
  const counts = {};

  for (const collectionName of quotaCollections) {
    counts[collectionName] = await models[collectionName].countDocuments({});
  }

  return counts;
}

async function clearDocuments(models) {
  const deleted = {};

  for (const collectionName of quotaCollections) {
    const result = await models[collectionName].deleteMany({});
    deleted[collectionName] = result.deletedCount ?? 0;
  }

  return deleted;
}

async function run() {
  await connect();

  try {
    const models = createModels(mongoose);
    const before = await countDocuments(models);
    const deleted = await clearDocuments(models);
    const after = await countDocuments(models);

    console.log(
      JSON.stringify(
        {
          clearedAt: new Date().toISOString(),
          collections: quotaCollections,
          before,
          deleted,
          after,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { run };
