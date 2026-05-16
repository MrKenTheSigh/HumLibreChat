import { ProxyAgent } from 'undici';
import { Providers } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { KnownEndpoints, EModelEndpoint } from 'librechat-data-provider';
import type * as t from '~/types';
import { getLLMConfig as getAnthropicLLMConfig } from '~/endpoints/anthropic/llm';
import { getOpenAILLMConfig, extractDefaultParams } from './llm';
import { getGoogleConfig } from '~/endpoints/google/llm';
import { transformToOpenAIConfig } from './transform';
import { constructAzureURL } from '~/utils/azure';
import { createFetch } from '~/utils/generators';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type OpenAIContentPart = {
  type?: string;
  text?: string;
  image_url?: string | { url?: string; detail?: string };
};

type OpenAIMessageParam = {
  role?: string;
  name?: string;
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

type OllamaRequestNormalization = {
  body: RequestInit['body'];
  hadToolResult: boolean;
  parsed?: {
    model?: string;
    messages?: OpenAIMessageParam[];
    tools?: unknown;
    tool_choice?: unknown;
    parallel_tool_calls?: unknown;
    stream?: boolean;
  };
};

function normalizeOllamaRole(role?: string): string {
  if (role === 'developer') {
    return 'system';
  }

  if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
    return role;
  }

  return 'user';
}

function getImageURL(value: OpenAIContentPart['image_url']): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  return value?.url;
}

function isOllamaSupportedImageURL(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('data:image/') && value.includes(';base64,');
}

function normalizeOllamaMessage(message: OpenAIMessageParam): OpenAIMessageParam | null {
  const role = normalizeOllamaRole(message.role);
  const normalized: OpenAIMessageParam = { role };
  if (message.tool_calls) {
    normalized.tool_calls = message.tool_calls;
  }
  if (message.tool_call_id) {
    normalized.tool_call_id = message.tool_call_id;
  }
  if (message.name) {
    normalized.name = message.name;
  }

  if (typeof message.content === 'string') {
    normalized.content = message.content;
    return normalized;
  }

  if (!Array.isArray(message.content)) {
    if (message.tool_calls || message.role === 'tool') {
      normalized.content = message.content ?? '';
      return normalized;
    }
    return null;
  }

  const textParts: string[] = [];
  const imageParts: OpenAIContentPart[] = [];

  for (const part of message.content) {
    if (typeof part?.text === 'string' && part.text.trim().length > 0) {
      textParts.push(part.text.trim());
      continue;
    }

    if (part?.type === 'image_url') {
      const imageURL = getImageURL(part.image_url);
      if (isOllamaSupportedImageURL(imageURL)) {
        imageParts.push({ type: 'image_url', image_url: { url: imageURL } });
      }
    }
  }

  if (imageParts.length === 0) {
    normalized.content = textParts.join('\n\n');
  } else {
    normalized.content = [...textParts.map((text) => ({ type: 'text', text })), ...imageParts];
  }

  return normalized.content === '' ? null : normalized;
}

function getLatestOllamaUserIndex(messages: OpenAIMessageParam[] | undefined): number {
  if (!messages) {
    return -1;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i;
    }
  }

  return -1;
}

function hasCurrentTurnOllamaToolResult(messages: OpenAIMessageParam[]): boolean {
  const latestUserIndex = getLatestOllamaUserIndex(messages);
  return messages.some((message, index) => index > latestUserIndex && message.role === 'tool');
}

function normalizeOllamaConversationMessages(messages: OpenAIMessageParam[]): OpenAIMessageParam[] {
  return messages
    .filter((message) => message.role !== 'tool')
    .map((message) => normalizeOllamaMessage({ ...message, tool_calls: undefined }))
    .filter((message): message is OpenAIMessageParam => message != null);
}

function normalizeOllamaToolResultContent(content: string): string {
  const normalizedSections = content
    .split(/\n(?=# Search \d+: )/g)
    .map((section) => {
      const title = section.match(/^# Search \d+: "([^"]+)"/m)?.[1];
      if (!title) {
        return null;
      }

      const anchor = section.match(/^Anchor:\s*(.+)$/m)?.[1]?.trim();
      const url = section.match(/^URL:\s*(.+)$/m)?.[1]?.trim();
      const summary = section.match(/^Summary:\s*(.+)$/m)?.[1]?.trim();
      const source = section.match(/^Source:\s*(.+)$/m)?.[1]?.trim();
      const date = section.match(/^Date:\s*(.+)$/m)?.[1]?.trim();

      return [
        `Result: ${title}`,
        anchor ? `Anchor: ${anchor}` : null,
        url ? `URL: ${url}` : null,
        source ? `Source: ${source}` : null,
        date ? `Date: ${date}` : null,
        summary ? `Summary: ${summary}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter((section): section is string => section != null);

  if (normalizedSections.length > 0) {
    return normalizedSections.join('\n\n');
  }

  return content.replace(/## Highlights[\s\S]*$/m, '').trim() || content;
}

function buildOllamaToolResultMessage(messages: OpenAIMessageParam[]): OpenAIMessageParam | null {
  const latestUserIndex = getLatestOllamaUserIndex(messages);
  const toolResults = messages
    .filter(
      (message, index): message is OpenAIMessageParam & { content: string } =>
        index > latestUserIndex && message.role === 'tool' && typeof message.content === 'string',
    )
    .map((message) => {
      const name = message.name ?? 'tool';
      return `Tool result (${name}):\n${normalizeOllamaToolResultContent(message.content)}`;
    });

  if (toolResults.length === 0) {
    return null;
  }

  return {
    role: 'user',
    content: [
      'The tool call has already completed. Use the completed tool result below to answer the original user request now.',
      'Do not call tools. Do not ask for another query. Extract concrete facts and cite anchors when present.',
      'Prefer Summary lines over Highlights. Ignore missing or conflicting Highlight snippets when Summary contains concrete values.',
      'The tool result is a set of candidate web results, not facts supplied by the user. Do not summarize every result.',
      'Use only results that directly answer the latest user request. Ignore unrelated historical data, climate averages, monthly summaries, encyclopedia pages, and generic market pages unless the latest user request asks for them.',
      'For weather requests, prioritize official current forecasts and report the requested date/time periods. For market price requests, prioritize current quote summaries and include the ticker/source time if present.',
      '',
      ...toolResults,
    ].join('\n'),
  };
}

function normalizeOllamaPostToolMessages(messages: OpenAIMessageParam[]): OpenAIMessageParam[] {
  const normalizedMessages = messages
    .filter((message) => message.role !== 'tool')
    .map((message) => ({ ...message, tool_calls: undefined }))
    .map((message) => normalizeOllamaMessage(message))
    .filter((message): message is OpenAIMessageParam => message != null);

  const toolResultMessage = buildOllamaToolResultMessage(messages);
  if (toolResultMessage) {
    normalizedMessages.push(toolResultMessage);
  }

  return normalizedMessages;
}

function normalizeOllamaRequestBody(body: RequestInit['body']): OllamaRequestNormalization {
  if (typeof body !== 'string') {
    return { body, hadToolResult: false };
  }

  try {
    const parsed = JSON.parse(body) as {
      model?: string;
      messages?: OpenAIMessageParam[];
      tools?: unknown;
      tool_choice?: unknown;
      parallel_tool_calls?: unknown;
      stream?: boolean;
    };
    if (!Array.isArray(parsed.messages)) {
      return { body, hadToolResult: false };
    }

    const hasToolResult = hasCurrentTurnOllamaToolResult(parsed.messages);

    if (hasToolResult) {
      parsed.messages = normalizeOllamaPostToolMessages(parsed.messages);
      parsed.tool_choice = 'none';
      delete parsed.tools;
    } else {
      parsed.messages = normalizeOllamaConversationMessages(parsed.messages);
    }

    delete parsed.parallel_tool_calls;

    logOllamaRequestSummary(parsed, hasToolResult);

    return { body: JSON.stringify(parsed), hadToolResult: hasToolResult, parsed };
  } catch {
    return { body, hadToolResult: false };
  }
}

function hasResponseToolCalls(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') {
    return false;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return false;
  }
  return choices.some((choice) => {
    const message = (choice as { message?: { tool_calls?: unknown } }).message;
    return Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
  });
}

async function responseHasToolCalls(response: Response): Promise<boolean> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return hasResponseToolCalls(await response.clone().json());
  }

  const text = await response.clone().text();
  return /"tool_calls"\s*:/.test(text);
}

function createOllamaRetryBody(parsed: NonNullable<OllamaRequestNormalization['parsed']>): string {
  const retryPayload = {
    ...parsed,
    tools: undefined,
    tool_choice: undefined,
    parallel_tool_calls: undefined,
    messages: [
      ...(parsed.messages ?? []),
      {
        role: 'user',
        content:
          'Tools are no longer available in this step. Answer the original user request now using the latest tool result. Do not call tools.',
      },
    ],
  };

  delete retryPayload.tools;
  delete retryPayload.tool_choice;
  delete retryPayload.parallel_tool_calls;

  return JSON.stringify(retryPayload);
}

function truncateForLog(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) {
    return '';
  }

  const compact = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[base64-image]');
  return compact.length > 600 ? `${compact.slice(0, 600)}...` : compact;
}

function logOllamaRequestSummary(
  parsed: {
    model?: string;
    messages?: OpenAIMessageParam[];
    tools?: unknown;
    tool_choice?: unknown;
    parallel_tool_calls?: unknown;
    stream?: boolean;
  },
  hadToolResult: boolean,
): void {
  if (process.env.DEBUG_OLLAMA_MESSAGES !== 'true') {
    return;
  }

  const payload = {
    model: parsed.model,
    hadToolResult,
    hasTools: Array.isArray(parsed.tools) ? parsed.tools.length : Boolean(parsed.tools),
    toolChoice: parsed.tool_choice,
    parallelToolCalls: parsed.parallel_tool_calls,
    stream: parsed.stream,
    messages: parsed.messages?.map((message, index) => ({
      index,
      role: message.role,
      name: message.name,
      hasToolCalls: Array.isArray(message.tool_calls)
        ? message.tool_calls.length
        : Boolean(message.tool_calls),
      hasToolCallId: Boolean(message.tool_call_id),
      content: truncateForLog(message.content),
    })),
  };

  logger.info(`[Ollama message payload] ${JSON.stringify(payload)}`);
}

function createOllamaFetch(): Fetch {
  return async (input, init) => {
    const normalized = normalizeOllamaRequestBody(init?.body);
    const nextInit = init
      ? {
          ...init,
          body: normalized.body,
        }
      : init;

    const response = await fetch(input, nextInit);

    if (!normalized.hadToolResult || !normalized.parsed) {
      return response;
    }

    try {
      if (!(await responseHasToolCalls(response))) {
        return response;
      }

      logger.warn(
        '[Ollama message payload] post-tool response contained tool_calls; retrying without tools.',
      );
      const retryResponse = await fetch(input, {
        ...nextInit,
        body: createOllamaRetryBody(normalized.parsed),
      });
      return retryResponse;
    } catch {
      return response;
    }
  };
}

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
export function getOpenAIConfig(
  apiKey: string,
  options: t.OpenAIConfigOptions = {},
  endpoint?: string | null,
): t.OpenAIConfigResult {
  const {
    proxy,
    addParams,
    dropParams,
    defaultQuery,
    directEndpoint,
    streaming = true,
    modelOptions = {},
    reverseProxyUrl: baseURL,
  } = options;

  /** Extract default params from customParams.paramDefinitions */
  const defaultParams = extractDefaultParams(options.customParams?.paramDefinitions);

  let llmConfig: t.OAIClientOptions;
  let tools: t.LLMConfigResult['tools'];
  const isAnthropic = options.customParams?.defaultParamsEndpoint === EModelEndpoint.anthropic;
  const isGoogle = options.customParams?.defaultParamsEndpoint === EModelEndpoint.google;

  const useOpenRouter =
    !isAnthropic &&
    !isGoogle &&
    ((baseURL && baseURL.includes(KnownEndpoints.openrouter)) ||
      (endpoint != null && endpoint.toLowerCase().includes(KnownEndpoints.openrouter)));
  const isOllama =
    endpoint?.toLowerCase() === KnownEndpoints.ollama ||
    baseURL?.toLowerCase().includes(KnownEndpoints.ollama) === true ||
    baseURL?.includes('11434') === true;
  const isVercel =
    !isAnthropic &&
    !isGoogle &&
    ((baseURL && baseURL.includes('ai-gateway.vercel.sh')) ||
      (endpoint != null && endpoint.toLowerCase().includes(KnownEndpoints.vercel)));

  let azure = options.azure;
  let headers = options.headers;
  if (isAnthropic) {
    const anthropicResult = getAnthropicLLMConfig(apiKey, {
      modelOptions,
      proxy: options.proxy,
      reverseProxyUrl: baseURL,
      addParams,
      dropParams,
      defaultParams,
    });
    /** Transform handles addParams/dropParams - it knows about OpenAI params */
    const transformed = transformToOpenAIConfig({
      addParams,
      dropParams,
      llmConfig: anthropicResult.llmConfig,
      fromEndpoint: EModelEndpoint.anthropic,
    });
    llmConfig = transformed.llmConfig;
    tools = anthropicResult.tools;
    if (transformed.configOptions?.defaultHeaders) {
      headers = Object.assign(headers ?? {}, transformed.configOptions?.defaultHeaders);
    }
  } else if (isGoogle) {
    const googleResult = getGoogleConfig(
      apiKey,
      {
        modelOptions,
        reverseProxyUrl: baseURL ?? undefined,
        authHeader: true,
        addParams,
        dropParams,
        defaultParams,
      },
      true,
    );
    /** Transform handles addParams/dropParams - it knows about OpenAI params */
    const transformed = transformToOpenAIConfig({
      addParams,
      dropParams,
      defaultParams,
      tools: googleResult.tools,
      llmConfig: googleResult.llmConfig,
      fromEndpoint: EModelEndpoint.google,
    });
    llmConfig = transformed.llmConfig;
    tools = transformed.tools;
  } else {
    const openaiResult = getOpenAILLMConfig({
      azure,
      apiKey,
      baseURL,
      endpoint,
      streaming,
      addParams,
      dropParams,
      defaultParams,
      modelOptions,
      useOpenRouter,
    });
    llmConfig = openaiResult.llmConfig;
    azure = openaiResult.azure;
    tools = openaiResult.tools;
  }

  const configOptions: t.OpenAIConfiguration = {};
  if (baseURL) {
    configOptions.baseURL = baseURL;
  }
  if (useOpenRouter || isVercel) {
    configOptions.defaultHeaders = Object.assign(
      {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
        'X-OpenRouter-Title': 'LibreChat',
        'X-OpenRouter-Categories': 'general-chat,personal-agent',
      },
      headers,
    );
  } else if (headers) {
    configOptions.defaultHeaders = headers;
  }

  if (defaultQuery) {
    configOptions.defaultQuery = defaultQuery;
  }

  if (proxy) {
    const proxyAgent = new ProxyAgent(proxy);
    configOptions.fetchOptions = {
      dispatcher: proxyAgent,
    };
  }

  if (azure && !isAnthropic) {
    const constructAzureResponsesApi = () => {
      if (!llmConfig.useResponsesApi || !azure) {
        return;
      }

      const updatedUrl = configOptions.baseURL?.replace(/\/deployments(?:\/.*)?$/, '/v1');

      configOptions.baseURL = constructAzureURL({
        baseURL: updatedUrl || 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
        azureOptions: azure,
      });

      configOptions.defaultHeaders = {
        ...configOptions.defaultHeaders,
        'api-key': apiKey,
      };
      configOptions.defaultQuery = {
        ...configOptions.defaultQuery,
        'api-version': configOptions.defaultQuery?.['api-version'] ?? 'preview',
      };
    };

    constructAzureResponsesApi();
  }

  if (process.env.OPENAI_ORGANIZATION && !isAnthropic) {
    configOptions.organization = process.env.OPENAI_ORGANIZATION;
  }

  if (directEndpoint === true && configOptions?.baseURL != null) {
    configOptions.fetch = createFetch({
      directEndpoint: directEndpoint,
      reverseProxyUrl: configOptions?.baseURL,
    }) as unknown as Fetch;
  } else if (isOllama) {
    configOptions.fetch = createOllamaFetch();
  }

  if (isOllama && Array.isArray(tools) && tools.length > 0) {
    tools = [];
    delete (llmConfig as Record<string, unknown>).useResponsesApi;
  }

  const result: t.OpenAIConfigResult = {
    llmConfig,
    configOptions,
    tools,
  };
  if (useOpenRouter) {
    result.provider = Providers.OPENROUTER;
  }
  return result;
}
