const { CacheKeys } = require('librechat-data-provider');
const { logger, AppService } = require('@librechat/data-schemas');
const {
  loadManagedChannelsIntoConfig,
  loadManagedSystemSettingsIntoConfig,
} = require('@librechat/api');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const { setCachedTools } = require('./getCachedTools');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');

const BASE_CONFIG_KEY = '_BASE_';

const loadBaseConfig = async () => {
  /** @type {TCustomConfig} */
  const bootstrapConfig = (await loadCustomConfig()) ?? {};
  const channelConfig = await loadManagedChannelsIntoConfig(bootstrapConfig);
  const config = await loadManagedSystemSettingsIntoConfig(channelConfig);
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, refresh } = options;

  const cache = getLogStores(CacheKeys.APP_CONFIG);
  const cacheKey = role ? role : BASE_CONFIG_KEY;

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let baseConfig = refresh ? null : await cache.get(BASE_CONFIG_KEY);
  if (!baseConfig) {
    logger.info('[getAppConfig] App configuration not initialized. Initializing AppService...');
    baseConfig = await loadBaseConfig();

    if (!baseConfig) {
      throw new Error('Failed to initialize app configuration through AppService.');
    }

    if (baseConfig.availableTools) {
      await setCachedTools(baseConfig.availableTools);
    }

    await cache.set(BASE_CONFIG_KEY, baseConfig);
  }

  // For now, return the base config
  // In the future, this is where we'll apply role-based modifications
  if (role) {
    // TODO: Apply role-based config modifications
    // const roleConfig = await applyRoleBasedConfig(baseConfig, role);
    // await cache.set(cacheKey, roleConfig);
    // return roleConfig;
  }

  return baseConfig;
}

/**
 * Clear the app configuration cache
 * @returns {Promise<boolean>}
 */
async function clearAppConfigCache() {
  const cache = getLogStores(CacheKeys.APP_CONFIG);
  return await cache.delete(BASE_CONFIG_KEY);
}

async function clearRuntimeConfigCaches() {
  const appCache = getLogStores(CacheKeys.APP_CONFIG);
  const configCache = getLogStores(CacheKeys.CONFIG_STORE);

  await Promise.all([
    appCache.delete(BASE_CONFIG_KEY),
    configCache.delete(CacheKeys.ENDPOINT_CONFIG),
    configCache.delete(CacheKeys.MODELS_CONFIG),
    configCache.delete(CacheKeys.STARTUP_CONFIG),
  ]);

  return true;
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  clearRuntimeConfigCaches,
};
