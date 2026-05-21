import {
  AuthType,
  SafeSearchTypes,
  SearchCategories,
  extractVariableName,
} from 'librechat-data-provider';
import { webSearchAuth } from '@librechat/data-schemas';
import type {
  RerankerTypes,
  TCustomConfig,
  SearchProviders,
  ScraperProviders,
  TWebSearchConfig,
} from 'librechat-data-provider';
import type { TWebSearchKeys, TWebSearchCategories } from '@librechat/data-schemas';
import { isSSRFTarget, resolveHostnameSSRF } from '../auth';

/**
 * URL-type keys in TWebSearchKeys (not API keys or version strings).
 * Must stay in sync with URL-typed fields in webSearchAuth (packages/data-schemas).
 */
const WEB_SEARCH_URL_KEYS = new Set<TWebSearchKeys>([
  'searxngInstanceUrl',
  'firecrawlApiUrl',
  'jinaApiUrl',
]);

/**
 * Returns true if the URL should be blocked for SSRF risk.
 * Fail-closed: unparseable URLs and non-HTTP(S) schemes return true.
 */
async function isSSRFUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }
  if (isSSRFTarget(parsed.hostname)) {
    return true;
  }
  return resolveHostnameSSRF(parsed.hostname);
}

export function extractWebSearchEnvVars({
  keys,
  config,
}: {
  keys: TWebSearchKeys[];
  config: TCustomConfig['webSearch'] | undefined;
}): string[] {
  if (!config) {
    return [];
  }

  const authFields: string[] = [];
  const relevantKeys = keys.filter((k) => k in config);

  for (const key of relevantKeys) {
    const value = config[key];
    if (typeof value === 'string') {
      const varName = extractVariableName(value);
      if (varName) {
        authFields.push(varName);
      }
    }
  }

  return authFields;
}

function getDirectWebSearchValue(configValue: unknown): string | undefined {
  if (typeof configValue !== 'string') {
    return undefined;
  }

  const value = configValue.trim();
  if (value.length === 0 || extractVariableName(value)) {
    return undefined;
  }

  return value;
}

/**
 * Type for web search authentication result
 */
export interface WebSearchAuthResult {
  /** Whether all required categories have at least one authenticated service */
  authenticated: boolean;
  /** Authentication type (user_provided or system_defined) by category */
  authTypes: [TWebSearchCategories, AuthType][];
  /** Original authentication values mapped to their respective keys */
  authResult: Partial<TWebSearchConfig>;
}

/**
 * Loads and verifies web search authentication values
 * @param params - Authentication parameters
 * @returns Authentication result
 */
export async function loadWebSearchAuth({
  userId,
  webSearchConfig,
  loadAuthValues,
  throwError = true,
}: {
  userId: string;
  webSearchConfig: TCustomConfig['webSearch'];
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
    throwError?: boolean;
  }) => Promise<Record<string, string>>;
  throwError?: boolean;
}): Promise<WebSearchAuthResult> {
  let authenticated = true;
  const authResult: Partial<TWebSearchConfig> = {};

  /** Type-safe iterator for the category-service combinations */
  async function checkAuth(category: TWebSearchCategories): Promise<[boolean, boolean]> {
    type ServiceType = string;
    let isUserProvided = false;
    const categoryAuth = webSearchAuth[category] as Record<
      string,
      Partial<Record<TWebSearchKeys, 0 | 1>>
    >;

    // Check if a specific service is specified in the config
    let specificService: ServiceType | undefined;
    if (category === SearchCategories.PROVIDERS && webSearchConfig?.searchProvider) {
      specificService = webSearchConfig.searchProvider as unknown as ServiceType;
    } else if (category === SearchCategories.SCRAPERS && webSearchConfig?.scraperProvider) {
      specificService = webSearchConfig.scraperProvider as unknown as ServiceType;
    } else if (category === SearchCategories.RERANKERS && webSearchConfig?.rerankerType) {
      specificService = webSearchConfig.rerankerType as unknown as ServiceType;
    }

    // If a specific service is specified, only check that one
    const services = specificService
      ? [specificService]
      : (Object.keys(categoryAuth) as ServiceType[]);

    for (const service of services) {
      // Skip if the service doesn't exist in the webSearchAuth config
      if (!categoryAuth[service]) {
        continue;
      }

      const serviceConfig = categoryAuth[service];

      // Split keys into required and optional
      const requiredKeys: TWebSearchKeys[] = [];
      const optionalKeys: TWebSearchKeys[] = [];

      for (const key in serviceConfig) {
        const typedKey = key as TWebSearchKeys;
        if (serviceConfig[typedKey as keyof typeof serviceConfig] === 1) {
          requiredKeys.push(typedKey);
        } else if (serviceConfig[typedKey as keyof typeof serviceConfig] === 0) {
          optionalKeys.push(typedKey);
        }
      }

      if (requiredKeys.length === 0) continue;

      const directValues: Partial<Record<TWebSearchKeys, string>> = {};
      const authFieldByKey = new Map<TWebSearchKeys, string>();
      const requiredAuthFields: string[] = [];
      const optionalAuthFields: string[] = [];

      for (const key of requiredKeys) {
        const directValue = getDirectWebSearchValue(webSearchConfig?.[key]);
        if (directValue) {
          directValues[key] = directValue;
          continue;
        }

        const authFields = extractWebSearchEnvVars({ keys: [key], config: webSearchConfig });
        if (authFields.length === 1) {
          requiredAuthFields.push(authFields[0]);
          authFieldByKey.set(key, authFields[0]);
        }
      }

      for (const key of optionalKeys) {
        const directValue = getDirectWebSearchValue(webSearchConfig?.[key]);
        if (directValue) {
          directValues[key] = directValue;
          continue;
        }

        const authFields = extractWebSearchEnvVars({ keys: [key], config: webSearchConfig });
        if (authFields.length === 1) {
          optionalAuthFields.push(authFields[0]);
          authFieldByKey.set(key, authFields[0]);
        }
      }

      if (
        requiredAuthFields.length +
          Object.keys(directValues).filter((key) => requiredKeys.includes(key as TWebSearchKeys))
            .length !==
        requiredKeys.length
      ) {
        continue;
      }

      const allKeys = [...requiredKeys, ...optionalKeys];
      const allAuthFields = [...requiredAuthFields, ...optionalAuthFields];
      const optionalSet = new Set(optionalAuthFields);

      try {
        const authValues =
          allAuthFields.length > 0
            ? await loadAuthValues({
                userId,
                authFields: allAuthFields,
                optional: optionalSet,
                throwError,
              })
            : {};

        let allFieldsAuthenticated = true;
        for (const originalKey of allKeys) {
          const directValue = directValues[originalKey];
          const field = directValue ? undefined : authFieldByKey.get(originalKey);
          const value = directValue ?? (field ? authValues[field] : undefined);
          const isOptional = field ? optionalSet.has(field) : optionalKeys.includes(originalKey);

          if (!isOptional && !value) {
            allFieldsAuthenticated = false;
            break;
          }
          if (isOptional && !value) {
            continue;
          }

          const isFieldUserProvided = !!field && value != null && process.env[field] !== value;
          const isUrlKey = originalKey != null && WEB_SEARCH_URL_KEYS.has(originalKey);
          let contributed = false;

          if (isUrlKey && value && isFieldUserProvided && (await isSSRFUrl(value))) {
            if (!isOptional) {
              allFieldsAuthenticated = false;
              break;
            }
          } else if (originalKey) {
            authResult[originalKey] = value;
            contributed = true;
          }

          if (!isUserProvided && isFieldUserProvided && contributed) {
            isUserProvided = true;
          }
        }

        if (!allFieldsAuthenticated) {
          continue;
        }
        if (category === SearchCategories.PROVIDERS) {
          authResult.searchProvider = service as SearchProviders;
        } else if (category === SearchCategories.SCRAPERS) {
          authResult.scraperProvider = service as ScraperProviders;
        } else if (category === SearchCategories.RERANKERS) {
          authResult.rerankerType = service as RerankerTypes;
        }
        return [true, isUserProvided];
      } catch {
        continue;
      }
    }
    return [false, isUserProvided];
  }

  const categories = [
    SearchCategories.PROVIDERS,
    SearchCategories.SCRAPERS,
    SearchCategories.RERANKERS,
  ] as const;
  const authTypes: [TWebSearchCategories, AuthType][] = [];
  for (const category of categories) {
    const [isCategoryAuthenticated, isUserProvided] = await checkAuth(category);
    if (!isCategoryAuthenticated) {
      authenticated = false;
      authTypes.push([category, AuthType.USER_PROVIDED]);
      continue;
    }
    authTypes.push([category, isUserProvided ? AuthType.USER_PROVIDED : AuthType.SYSTEM_DEFINED]);
  }

  authResult.safeSearch = webSearchConfig?.safeSearch ?? SafeSearchTypes.MODERATE;
  authResult.scraperTimeout =
    webSearchConfig?.scraperTimeout ?? webSearchConfig?.firecrawlOptions?.timeout ?? 7500;
  authResult.firecrawlOptions = webSearchConfig?.firecrawlOptions;

  return {
    authTypes,
    authResult,
    authenticated,
  };
}
