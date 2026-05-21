const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

const WEB_SEARCH_AUTH_FIELDS = [
  'SERPER_API_KEY',
  'SEARXNG_INSTANCE_URL',
  'SEARXNG_API_KEY',
  'FIRECRAWL_API_KEY',
  'FIRECRAWL_API_URL',
  'FIRECRAWL_VERSION',
  'JINA_API_KEY',
  'JINA_API_URL',
  'COHERE_API_KEY',
];

const WEB_SEARCH_SETTING_FIELDS = [
  'serperApiKey',
  'searxngInstanceUrl',
  'searxngApiKey',
  'firecrawlApiKey',
  'firecrawlApiUrl',
  'firecrawlVersion',
  'jinaApiKey',
  'jinaApiUrl',
  'cohereApiKey',
];

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function redactSystemSetting(value) {
  const redacted = {};
  for (const field of WEB_SEARCH_SETTING_FIELDS) {
    redacted[field] = hasValue(value?.[field]) ? 'SET' : '';
  }
  return {
    searchProvider: value?.searchProvider || null,
    scraperProvider: value?.scraperProvider || null,
    rerankerType: value?.rerankerType || null,
    ...redacted,
  };
}

async function run() {
  await connect();

  const models = createModels(mongoose);
  const filter = {
    authField: { $in: WEB_SEARCH_AUTH_FIELDS },
    $or: [{ pluginKey: 'web_search' }, { pluginKey: { $exists: false } }, { pluginKey: null }],
  };

  const beforeCount = await models.PluginAuth.countDocuments(filter);
  const deleteResult = await models.PluginAuth.deleteMany(filter);
  const afterCount = await models.PluginAuth.countDocuments(filter);
  const systemSetting = await models.AdminSystemSetting.findOne({ key: 'web_search' }).lean();

  console.log(
    JSON.stringify(
      {
        deletedCount: deleteResult.deletedCount,
        oldPluginAuthCountBefore: beforeCount,
        oldPluginAuthCountAfter: afterCount,
        systemSetting: redactSystemSetting(systemSetting?.value || {}),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };
