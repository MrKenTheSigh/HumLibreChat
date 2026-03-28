import path from 'path';
import { EModelEndpoint, AuthKeys } from 'librechat-data-provider';
import type {
  BaseInitializeParams,
  EndpointTokenConfig,
  InitializeResultBase,
  GoogleConfigOptions,
  GoogleCredentials,
} from '~/types';
import { isEnabled, loadServiceKey, checkUserKeyExpiry } from '~/utils';
import { getGoogleConfig } from './llm';

/**
 * Initializes Google/Vertex AI endpoint configuration.
 * Supports both API key authentication and service account credentials.
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to Google configuration options
 * @throws Error if no valid credentials are provided
 */
export async function initializeGoogle({
  req,
  endpoint,
  model_parameters,
  db,
}: BaseInitializeParams): Promise<InitializeResultBase> {
  void endpoint;
  const appConfig = req.config;
  const { GOOGLE_KEY, GOOGLE_REVERSE_PROXY, GOOGLE_AUTH_HEADER, PROXY } = process.env;
  const { key: expiresAt } = req.body;

  let userKey = null;
  const googleConfig = appConfig?.endpoints?.[EModelEndpoint.google];
  const managedApiKey = googleConfig?.apiKey;
  const managedBaseURL = googleConfig?.baseURL;
  const endpointTokenConfig: EndpointTokenConfig | undefined = googleConfig?.tokenConfig;
  const hasManagedApiKey = typeof managedApiKey === 'string' && managedApiKey.trim().length > 0;
  const isUserProvided = GOOGLE_KEY === 'user_provided' && hasManagedApiKey !== true;

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.google);
    userKey = await db.getUserKey({ userId: req.user?.id, name: EModelEndpoint.google });
  }

  let serviceKey: Record<string, unknown> = {};

  /** Check if GOOGLE_KEY is provided at all (including 'user_provided') */
  const isGoogleKeyProvided =
    hasManagedApiKey ||
    (GOOGLE_KEY && GOOGLE_KEY.trim() !== '') ||
    (isUserProvided && userKey != null) ||
    false;

  if (!isGoogleKeyProvided && loadServiceKey) {
    /** Only attempt to load service key if GOOGLE_KEY is not provided */
    try {
      const serviceKeyPath =
        process.env.GOOGLE_SERVICE_KEY_FILE || path.join(process.cwd(), 'api', 'data', 'auth.json');
      const loadedKey = await loadServiceKey(serviceKeyPath);
      if (loadedKey) {
        serviceKey = loadedKey;
      }
    } catch {
      // Service key loading failed, but that's okay if not required
      serviceKey = {};
    }
  }

  const credentials: GoogleCredentials = isUserProvided
    ? (userKey as GoogleCredentials)
    : {
        [AuthKeys.GOOGLE_SERVICE_KEY]: serviceKey,
        [AuthKeys.GOOGLE_API_KEY]: managedApiKey || GOOGLE_KEY,
      };

  let clientOptions: GoogleConfigOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const allConfig = appConfig?.endpoints?.all;
  if (googleConfig) {
    clientOptions.streamRate = googleConfig.streamRate;
    clientOptions.titleModel = googleConfig.titleModel;
  }

  if (allConfig) {
    clientOptions.streamRate = allConfig.streamRate;
  }

  clientOptions = {
    reverseProxyUrl: managedBaseURL || GOOGLE_REVERSE_PROXY || undefined,
    authHeader: isEnabled(GOOGLE_AUTH_HEADER) ?? undefined,
    proxy: PROXY ?? undefined,
    modelOptions: model_parameters ?? {},
    ...clientOptions,
  };

  const result = (await getGoogleConfig(credentials, clientOptions)) as InitializeResultBase;

  if (endpointTokenConfig) {
    result.endpointTokenConfig = endpointTokenConfig;
  }

  return result;
}
