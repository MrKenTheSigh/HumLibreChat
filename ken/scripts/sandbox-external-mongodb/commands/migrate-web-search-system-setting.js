const path = require('path');
const mongoose = require('mongoose');
const { createModels, decrypt } = require('@librechat/data-schemas');
const {
  RerankerTypes,
  SafeSearchTypes,
  ScraperProviders,
  SearchProviders,
} = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

const WEB_SEARCH_FIELDS = [
  ['SERPER_API_KEY', 'serperApiKey'],
  ['SEARXNG_INSTANCE_URL', 'searxngInstanceUrl'],
  ['SEARXNG_API_KEY', 'searxngApiKey'],
  ['FIRECRAWL_API_KEY', 'firecrawlApiKey'],
  ['FIRECRAWL_API_URL', 'firecrawlApiUrl'],
  ['FIRECRAWL_VERSION', 'firecrawlVersion'],
  ['JINA_API_KEY', 'jinaApiKey'],
  ['JINA_API_URL', 'jinaApiUrl'],
  ['COHERE_API_KEY', 'cohereApiKey'],
];

const DEFAULT_WEB_SEARCH_SETTING = {
  searchProvider: SearchProviders.SERPER,
  scraperProvider: ScraperProviders.FIRECRAWL,
  rerankerType: RerankerTypes.JINA,
  serperApiKey: '',
  searxngInstanceUrl: '',
  searxngApiKey: '',
  firecrawlApiKey: '',
  firecrawlApiUrl: '',
  firecrawlVersion: '',
  jinaApiKey: '',
  jinaApiUrl: '',
  cohereApiKey: '',
  scraperTimeout: 7500,
  safeSearch: SafeSearchTypes.MODERATE,
};

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function userLabel(user) {
  if (!user) {
    return 'unknown user';
  }

  const name = user.name || user.username || 'unnamed';
  return user.email ? `${name} (${user.email})` : `${name} (${user._id})`;
}

async function decryptPluginAuthValue(record) {
  const decrypted = await decrypt(record.value);
  return typeof decrypted === 'string' ? decrypted.trim() : '';
}

async function findLatestPluginAuthValues(models) {
  const authFields = WEB_SEARCH_FIELDS.map(([authField]) => authField);
  const records = await models.PluginAuth.find({ authField: { $in: authFields } })
    .sort({ updatedAt: -1 })
    .lean();

  const userIds = [...new Set(records.map((record) => String(record.userId)).filter(Boolean))];
  const users = await models.User.find({ _id: { $in: userIds } })
    .select('_id username email name')
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const values = {};
  const sources = {};
  const skipped = [];

  for (const record of records) {
    if (values[record.authField]) {
      continue;
    }

    try {
      const value = await decryptPluginAuthValue(record);
      if (!hasValue(value)) {
        skipped.push({ authField: record.authField, reason: 'empty decrypted value' });
        continue;
      }

      const user = usersById.get(String(record.userId));
      values[record.authField] = value;
      sources[record.authField] = {
        type: 'pluginAuth',
        pluginKey: record.pluginKey || null,
        user: userLabel(user),
        updatedAt: record.updatedAt || null,
      };
    } catch (error) {
      skipped.push({
        authField: record.authField,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { values, sources, skipped };
}

function findEnvValues() {
  const values = {};
  const sources = {};

  for (const [authField] of WEB_SEARCH_FIELDS) {
    const value = process.env[authField]?.trim();
    if (hasValue(value)) {
      values[authField] = value;
      sources[authField] = { type: 'env' };
    }
  }

  return { values, sources };
}

function pickProviderSettings(nextValue, existingValue) {
  if (!hasValue(existingValue.searchProvider)) {
    if (hasValue(nextValue.searxngInstanceUrl) && !hasValue(nextValue.serperApiKey)) {
      nextValue.searchProvider = SearchProviders.SEARXNG;
    } else {
      nextValue.searchProvider = SearchProviders.SERPER;
    }
  }

  if (!hasValue(existingValue.scraperProvider)) {
    if (hasValue(nextValue.firecrawlApiKey)) {
      nextValue.scraperProvider = ScraperProviders.FIRECRAWL;
    } else {
      nextValue.scraperProvider = ScraperProviders.SERPER;
    }
  }

  if (!hasValue(existingValue.rerankerType)) {
    if (hasValue(nextValue.cohereApiKey) && !hasValue(nextValue.jinaApiKey)) {
      nextValue.rerankerType = RerankerTypes.COHERE;
    } else {
      nextValue.rerankerType = RerankerTypes.JINA;
    }
  }
}

function redactSetting(value) {
  const redacted = { ...value };
  for (const [, settingField] of WEB_SEARCH_FIELDS) {
    redacted[settingField] = hasValue(redacted[settingField]) ? 'SET' : '';
  }
  return redacted;
}

async function run() {
  await connect();

  const models = createModels(mongoose);
  const existing = await models.AdminSystemSetting.findOne({ key: 'web_search' }).lean();
  const existingValue = existing?.value && typeof existing.value === 'object' ? existing.value : {};

  const env = findEnvValues();
  const pluginAuth = await findLatestPluginAuthValues(models);

  const nextValue = {
    ...DEFAULT_WEB_SEARCH_SETTING,
    ...existingValue,
  };
  const migratedFields = {};
  const missingFields = [];

  for (const [authField, settingField] of WEB_SEARCH_FIELDS) {
    const currentValue = nextValue[settingField];
    if (hasValue(currentValue)) {
      continue;
    }

    const value = env.values[authField] || pluginAuth.values[authField];
    if (!hasValue(value)) {
      missingFields.push(authField);
      continue;
    }

    nextValue[settingField] = value;
    migratedFields[settingField] = env.sources[authField] || pluginAuth.sources[authField];
  }

  pickProviderSettings(nextValue, existingValue);

  const now = new Date();
  await models.AdminSystemSetting.findOneAndUpdate(
    { key: 'web_search' },
    {
      $set: {
        key: 'web_search',
        value: nextValue,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  console.log(
    JSON.stringify(
      {
        updated: true,
        migratedFields,
        missingFields,
        skippedPluginAuthRecords: pluginAuth.skipped,
        setting: redactSetting(nextValue),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

module.exports = { run };
