const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { loadServiceKey, isUserProvided } = require('@librechat/api');
const { config } = require('./EndpointService');

function hasManagedGoogleConfig(appConfig) {
  const googleConfig = appConfig?.endpoints?.google;
  return typeof googleConfig?.apiKey === 'string' && googleConfig.apiKey.trim() !== '';
}

async function loadAsyncEndpoints(appConfig) {
  let serviceKey, googleUserProvides;
  const { googleKey } = config;
  const managedGoogleConfigured = hasManagedGoogleConfig(appConfig);

  /** Check if GOOGLE_KEY is provided at all(including 'user_provided') */
  const isGoogleKeyProvided =
    managedGoogleConfigured || (typeof googleKey === 'string' && googleKey.trim() !== '');

  if (isGoogleKeyProvided) {
    /** If GOOGLE_KEY is provided, check if it's user_provided */
    googleUserProvides = managedGoogleConfigured ? false : isUserProvided(googleKey);
  } else {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    const serviceKeyPath =
      process.env.GOOGLE_SERVICE_KEY_FILE || path.join(__dirname, '../../..', 'data', 'auth.json');

    try {
      serviceKey = await loadServiceKey(serviceKeyPath);
    } catch (error) {
      logger.error('Error loading service key', error);
      serviceKey = null;
    }
  }

  const google = serviceKey || isGoogleKeyProvided ? { userProvide: googleUserProvides } : false;

  return { google };
}

module.exports = loadAsyncEndpoints;
