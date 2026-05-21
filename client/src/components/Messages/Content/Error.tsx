// file deepcode ignore HardcodedNonCryptoSecret: No hardcoded secrets
import { ViolationTypes, ErrorTypes, alternateName } from 'librechat-data-provider';
import type { LocalizeFunction } from '~/common';
import { formatJSON, extractJson, isJson } from '~/utils/json';
import { useLocalize } from '~/hooks';
import CodeBlock from './CodeBlock';

const localizedErrorPrefix = 'com_error';

type TConcurrent = {
  limit: number;
};

type TMessageLimit = {
  max: number;
  windowInMinutes: number;
};

type TTokenBalance = {
  type: ViolationTypes | ErrorTypes;
  balance: number;
  tokenCost: number;
  promptTokens: number;
  prev_count: number;
  violation_count: number;
  date: Date;
  generations?: unknown[];
};

type TExpiredKey = {
  expiredAt: string;
  endpoint: string;
};

type TGenericError = {
  info: string;
};

type TSensitivePolicyDecision = {
  ruleCode: string;
  count: number;
  action: string;
  threshold?: {
    minCount?: number;
    action?: string;
  };
};

type TSensitivePolicyError = {
  type: 'sensitive_information_policy';
  action: string;
  decisions?: TSensitivePolicyDecision[];
};

const sensitiveRuleLabelKeys: Record<string, string> = {
  address: 'com_ui_admin_sensitive_rule_address',
  chinese_name: 'com_ui_admin_sensitive_rule_chinese_name',
  credit_card_number: 'com_ui_admin_sensitive_rule_credit_card_number',
  email_address: 'com_ui_admin_sensitive_rule_email_address',
  encrypted_file: 'com_ui_admin_sensitive_rule_encrypted_file',
  landline_phone_number: 'com_ui_admin_sensitive_rule_landline_phone_number',
  mobile_phone_number: 'com_ui_admin_sensitive_rule_mobile_phone_number',
  tw_national_id: 'com_ui_admin_sensitive_rule_tw_national_id',
};

function formatSensitivePolicyError(json: TSensitivePolicyError, localize: LocalizeFunction) {
  const decisions = Array.isArray(json.decisions) ? json.decisions : [];
  const blockingDecisions = decisions.filter((decision) => decision.action === 'block');
  const visibleDecisions = blockingDecisions.length > 0 ? blockingDecisions : decisions;

  return (
    <div className="space-y-2">
      <div>{localize('com_error_sensitive_policy_blocked')}</div>
      {visibleDecisions.length > 0 ? (
        <div className="space-y-1">
          <div>{localize('com_error_sensitive_policy_triggered_rules')}</div>
          <ul className="list-disc space-y-1 pl-5">
            {visibleDecisions.map((decision) => {
              const ruleLabelKey = sensitiveRuleLabelKeys[decision.ruleCode];
              const ruleLabel = ruleLabelKey
                ? localize(ruleLabelKey as Parameters<LocalizeFunction>[0])
                : decision.ruleCode;
              const threshold = decision.threshold?.minCount ?? 0;
              return (
                <li key={`${decision.ruleCode}-${decision.action}`}>
                  {localize('com_error_sensitive_policy_rule_count', {
                    0: ruleLabel,
                    1: decision.count,
                    2: threshold,
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const errorMessages = {
  [ErrorTypes.MODERATION]: 'com_error_moderation',
  [ErrorTypes.NO_USER_KEY]: 'com_error_no_user_key',
  [ErrorTypes.INVALID_USER_KEY]: 'com_error_invalid_user_key',
  [ErrorTypes.NO_BASE_URL]: 'com_error_no_base_url',
  [ErrorTypes.INVALID_BASE_URL]: 'com_error_invalid_base_url',
  [ErrorTypes.INVALID_ACTION]: `com_error_${ErrorTypes.INVALID_ACTION}`,
  [ErrorTypes.INVALID_REQUEST]: `com_error_${ErrorTypes.INVALID_REQUEST}`,
  [ErrorTypes.REFUSAL]: 'com_error_refusal',
  [ErrorTypes.MISSING_MODEL]: (json: TGenericError, localize: LocalizeFunction) => {
    const { info: endpoint } = json;
    const provider = (alternateName[endpoint ?? ''] as string | undefined) ?? endpoint ?? 'unknown';
    return localize('com_error_missing_model', { 0: provider });
  },
  [ErrorTypes.MODELS_NOT_LOADED]: 'com_error_models_not_loaded',
  [ErrorTypes.ENDPOINT_MODELS_NOT_LOADED]: (json: TGenericError, localize: LocalizeFunction) => {
    const { info: endpoint } = json;
    const provider = (alternateName[endpoint ?? ''] as string | undefined) ?? endpoint ?? 'unknown';
    return localize('com_error_endpoint_models_not_loaded', { 0: provider });
  },
  [ErrorTypes.NO_SYSTEM_MESSAGES]: `com_error_${ErrorTypes.NO_SYSTEM_MESSAGES}`,
  [ErrorTypes.EXPIRED_USER_KEY]: (json: TExpiredKey, localize: LocalizeFunction) => {
    const { expiredAt, endpoint } = json;
    return localize('com_error_expired_user_key', { 0: endpoint, 1: expiredAt });
  },
  [ErrorTypes.INPUT_LENGTH]: (json: TGenericError, localize: LocalizeFunction) => {
    const { info } = json;
    return localize('com_error_input_length', { 0: info });
  },
  [ErrorTypes.INVALID_AGENT_PROVIDER]: (json: TGenericError, localize: LocalizeFunction) => {
    const { info } = json;
    const provider = (alternateName[info] as string | undefined) ?? info;
    return localize('com_error_invalid_agent_provider', { 0: provider });
  },
  [ErrorTypes.GOOGLE_ERROR]: (json: TGenericError) => {
    const { info } = json;
    return info;
  },
  [ErrorTypes.GOOGLE_TOOL_CONFLICT]: 'com_error_google_tool_conflict',
  [ErrorTypes.STREAM_EXPIRED]: 'com_error_stream_expired',
  [ViolationTypes.BAN]:
    'Your account has been temporarily banned due to violations of our service.',
  [ViolationTypes.ILLEGAL_MODEL_REQUEST]: (json: TGenericError, localize: LocalizeFunction) => {
    const { info } = json;
    const [endpoint, model = 'unknown'] = info?.split('|') ?? [];
    const provider = (alternateName[endpoint ?? ''] as string | undefined) ?? endpoint ?? 'unknown';
    return localize('com_error_illegal_model_request', { 0: model, 1: provider });
  },
  invalid_api_key:
    'Invalid API key. Please check your API key and try again. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  insufficient_quota:
    'We apologize for any inconvenience caused. The default API key has reached its limit. To continue using this service, please set up your own API key. You can do this by clicking on the model logo in the left corner of the textbox and selecting "Set Token" for the current selected endpoint. Thank you for your understanding.',
  concurrent: (json: TConcurrent) => {
    const { limit } = json;
    const plural = limit > 1 ? 's' : '';
    return `Only ${limit} message${plural} at a time. Please allow any other responses to complete before sending another message, or wait one minute.`;
  },
  message_limit: (json: TMessageLimit) => {
    const { max, windowInMinutes } = json;
    const plural = max > 1 ? 's' : '';
    return `You hit the message limit. You have a cap of ${max} message${plural} per ${
      windowInMinutes > 1 ? `${windowInMinutes} minutes` : 'minute'
    }.`;
  },
  token_balance: (json: TTokenBalance) => {
    const { balance, tokenCost, promptTokens, generations } = json;
    const message = `Insufficient Funds! Balance: ${balance}. Prompt tokens: ${promptTokens}. Cost: ${tokenCost}.`;
    return (
      <>
        {message}
        {generations && (
          <>
            <br />
            <br />
          </>
        )}
        {generations && (
          <CodeBlock
            lang="Generations"
            error={true}
            codeChildren={formatJSON(JSON.stringify(generations))}
          />
        )}
      </>
    );
  },
  sensitive_information_policy: formatSensitivePolicyError,
};

const Error = ({ text }: { text: string }) => {
  const localize = useLocalize();
  const jsonString = extractJson(text);
  const errorMessage = text.length > 512 && !jsonString ? text.slice(0, 512) + '...' : text;
  const defaultResponse = `Something went wrong. Here's the specific error message we encountered: ${errorMessage}`;

  if (!isJson(jsonString)) {
    return defaultResponse;
  }

  const json = JSON.parse(jsonString);
  const errorKey = json.code || json.type;
  const keyExists = errorKey && errorMessages[errorKey];

  if (keyExists && typeof errorMessages[errorKey] === 'function') {
    return errorMessages[errorKey](json, localize);
  } else if (keyExists && keyExists.startsWith(localizedErrorPrefix)) {
    return localize(errorMessages[errorKey]);
  } else if (keyExists) {
    return errorMessages[errorKey];
  } else {
    return defaultResponse;
  }
};

export default Error;
