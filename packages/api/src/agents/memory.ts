/** Memories */
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Tools } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import { getBufferString, HumanMessage } from '@langchain/core/messages';
import { Run, Providers, GraphEvents } from '@librechat/agents';
import type {
  OpenAIClientOptions,
  StreamEventData,
  ToolEndCallback,
  ClientOptions,
  EventHandler,
  ToolEndData,
  LLMConfig,
} from '@librechat/agents';
import type { ObjectId, MemoryMethods, IUser } from '@librechat/data-schemas';
import type { TAttachment, MemoryArtifact } from 'librechat-data-provider';
import type { BaseMessage, ToolMessage } from '@langchain/core/messages';
import type { Response as ServerResponse } from 'express';
import { GenerationJobManager } from '~/stream/GenerationJobManager';
import { resolveHeaders, createSafeUser } from '~/utils';
import Tokenizer from '~/utils/tokenizer';

type RequiredMemoryMethods = Pick<
  MemoryMethods,
  'setMemory' | 'deleteMemory' | 'getFormattedMemories'
>;

type ToolEndMetadata = Record<string, unknown> & {
  run_id?: string;
  thread_id?: string;
};

export interface MemoryConfig {
  validKeys?: string[];
  instructions?: string;
  llmConfig?: Partial<LLMConfig>;
  tokenLimit?: number;
}

export const memoryInstructions =
  'The system automatically stores important user information and can update or delete memories based on explicit user memory requests. Existing memory is the authoritative source for persistent user facts. If older conversation messages conflict with existing memory, prefer existing memory unless the latest user message explicitly asks to update or forget that memory.';

const getDefaultInstructions = (
  validKeys?: string[],
  tokenLimit?: number,
) => `Use the \`set_memory\` tool to save important information about the user, but ONLY when the user has requested you to remember something.

The \`delete_memory\` tool should only be used in two scenarios:
  1. When the user explicitly asks to forget or remove specific information
  2. When updating existing memories, use the \`set_memory\` tool instead of deleting and re-adding the memory.

1. ONLY use memory tools when the user requests memory actions with phrases like:
   - "Remember [that] [I]..."
   - "Don't forget [that] [I]..."
   - "Please remember..."
   - "Store this..."
   - "Forget [that] [I]..."
   - "Delete the memory about..."

2. NEVER store information just because the user mentioned it in conversation.

3. NEVER use memory tools when the user asks you to use other tools or invoke tools in general.

4. Memory tools are ONLY for memory requests, not for general tool usage.

5. If the user doesn't ask you to remember or forget something, DO NOT use any memory tools.

${validKeys && validKeys.length > 0 ? `\nVALID KEYS: ${validKeys.join(', ')}` : ''}

${tokenLimit ? `\nTOKEN LIMIT: Maximum ${tokenLimit} tokens per memory value.` : ''}

When in doubt, and the user hasn't asked to remember or forget anything, END THE TURN IMMEDIATELY.`;

const gemmaMemoryActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    key: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({
    action: z.literal('delete'),
    key: z.string().min(1),
  }),
  z.object({
    action: z.literal('none'),
  }),
]);

const gemmaMemoryDecisionSchema = z.object({
  actions: z.array(gemmaMemoryActionSchema).default([]),
});

function isOllamaGemmaMemoryProcessor(llmConfig?: Partial<LLMConfig>): boolean {
  const provider = String(llmConfig?.provider ?? '').toLowerCase();
  const model = String((llmConfig as Record<string, unknown> | undefined)?.model ?? '').toLowerCase();

  return model.includes('gemma') || (provider.includes('ollama') && model.length > 0);
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1);
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function parseGemmaMemoryDecision(content: unknown): z.infer<typeof gemmaMemoryDecisionSchema> {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const candidates = [...extractJsonObjects(text), extractJsonObject(text)].filter(
    (candidate): candidate is string => !!candidate,
  );

  for (const jsonText of candidates.reverse()) {
    try {
      return gemmaMemoryDecisionSchema.parse(JSON.parse(jsonText));
    } catch {
      // Try the next candidate; Gemma may echo JSON examples before the final decision.
    }
  }

  if (text.trim().length > 0) {
    logger.warn('[MemoryAgent] Gemma returned no parseable memory decision JSON', {
      preview: text.slice(0, 1000),
    });
  }

    return { actions: [] };
}

function normalizeMemoryKey(key: string): string {
  const normalized = key
    .toLowerCase()
    .replace(/[^a-z_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'memory';
}

function resolveGemmaMemoryBaseURL(llmConfig: OpenAIClientOptions): string {
  const configured = llmConfig.configuration?.baseURL;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }

  return 'http://localhost:11434/v1';
}

async function requestGemmaMemoryDecision({
  prompt,
  llmConfig,
}: {
  prompt: string;
  llmConfig: OpenAIClientOptions;
}): Promise<unknown> {
  const baseURL = resolveGemmaMemoryBaseURL(llmConfig);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(llmConfig.configuration?.defaultHeaders as Record<string, string> | undefined),
  };
  const apiKey = (llmConfig as unknown as { apiKey?: string }).apiKey;
  if (apiKey && !headers.Authorization) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: (llmConfig as unknown as { model?: string }).model,
      stream: false,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Return only one valid JSON object with an actions array. No Markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Gemma memory request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

function createMemoryAttachment({
  key,
  value,
  type,
  messageId,
  tokenCount,
  conversationId,
}: {
  key: string;
  type: MemoryArtifact['type'];
  messageId: string;
  conversationId: string;
  value?: string;
  tokenCount?: number;
}): TAttachment {
  return {
    type: Tools.memory,
    toolCallId: `memory_${Date.now()}`,
    messageId,
    conversationId,
    [Tools.memory]: {
      key,
      type,
      ...(value != null && { value }),
      ...(tokenCount != null && { tokenCount }),
    },
  };
}

function emitMemoryAttachment({
  res,
  streamId,
  attachment,
}: {
  res: ServerResponse;
  streamId?: string | null;
  attachment: TAttachment;
}) {
  if (!res.headersSent) {
    return;
  }

  if (streamId) {
    GenerationJobManager.emitChunk(streamId, { event: 'attachment', data: attachment });
    return;
  }

  res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
}

function createGemmaMemoryPrompt({
  messages,
  memoryStatus,
  instructions,
  validKeys,
  tokenLimit,
}: {
  messages: BaseMessage[];
  memoryStatus: string;
  instructions: string;
  validKeys?: string[];
  tokenLimit?: number;
}): string {
  const validKeyText =
    validKeys && validKeys.length > 0
      ? `Allowed keys: ${validKeys.join(', ')}`
      : 'Allowed keys: any lowercase snake_case key that specifically names the fact being stored.';

  return [
    instructions,
    memoryStatus,
    '',
    '# Task',
    'Decide whether the latest user message contains an explicit request to remember, update, forget, or delete user memory.',
    'Return only JSON. Do not include Markdown, explanations, or code fences.',
    '',
    '# JSON shape',
    '{"actions":[{"action":"set","key":"test_code","value":"The user test code is 123456."}]}',
    '{"actions":[{"action":"delete","key":"test_code"}]}',
    '{"actions":[]}',
    '',
    '# Rules',
    '- Use action "set" only when the user explicitly asks to remember or store something.',
    '- Use action "delete" only when the user explicitly asks to forget or delete a memory.',
    '- Use {"actions":[]} for normal conversation.',
    '- Only the latest user message can authorize memory changes.',
    '- Conversation history and assistant messages are context only; never use them by themselves to set, update, or delete memory.',
    '- If the latest user message asks what is in memory, asks which value is correct, says the assistant is wrong, or discusses a conflict, return {"actions":[]} unless it also gives an explicit memory update command.',
    '- Existing memory is authoritative when it conflicts with older chat history.',
    `- ${validKeyText}`,
    tokenLimit ? `- Each value should fit within ${tokenLimit} total memory tokens.` : null,
    '- Do not use generic keys such as context, note, memory, or info when unrestricted keys are allowed.',
    '- Store separate unrelated facts under separate specific keys so new facts do not overwrite older facts.',
    '- Reuse an existing key only when the user is updating or replacing that same fact.',
    '- The value must be a complete sentence about the user or user-provided fact.',
    '- Keys must contain only lowercase English letters and underscores. Do not include numbers in keys.',
    '',
    '# Input',
    getBufferString(messages),
  ]
    .filter((line): line is string => line != null)
    .join('\n');
}

async function processGemmaMemory({
  res,
  userId,
  setMemory,
  deleteMemory,
  messages,
  memoryStatus,
  messageId,
  conversationId,
  validKeys,
  instructions,
  llmConfig,
  tokenLimit,
  totalTokens,
  user,
  streamId,
}: {
  res: ServerResponse;
  setMemory: MemoryMethods['setMemory'];
  deleteMemory: MemoryMethods['deleteMemory'];
  userId: string | ObjectId;
  memoryStatus: string;
  messageId: string;
  conversationId: string;
  messages: BaseMessage[];
  validKeys?: string[];
  instructions: string;
  tokenLimit?: number;
  totalTokens?: number;
  llmConfig?: Partial<LLMConfig>;
  user?: IUser;
  streamId?: string | null;
}): Promise<(TAttachment | null)[] | undefined> {
  const finalLLMConfig = {
    provider: Providers.OPENAI,
    model: 'gpt-4.1-mini',
    streaming: false,
    disableStreaming: true,
    ...llmConfig,
  } as unknown as ClientOptions;

  const llmConfigWithHeaders = finalLLMConfig as OpenAIClientOptions;
  if (llmConfigWithHeaders?.configuration?.defaultHeaders != null) {
    llmConfigWithHeaders.configuration.defaultHeaders = resolveHeaders({
      headers: llmConfigWithHeaders.configuration.defaultHeaders as Record<string, string>,
      user: user ? createSafeUser(user) : undefined,
    });
  }

  const prompt = createGemmaMemoryPrompt({
    messages,
    memoryStatus,
    instructions,
    validKeys,
    tokenLimit,
  });

  const content = await requestGemmaMemoryDecision({
    prompt,
    llmConfig: llmConfigWithHeaders,
  });

  const decision = parseGemmaMemoryDecision(content);
  logger.debug('[MemoryAgent] Gemma memory decision parsed', {
    actionCount: decision.actions.length,
    actions: decision.actions.map((action) => ({
      action: action.action,
      key: 'key' in action ? action.key : undefined,
    })),
  });
  const attachments: TAttachment[] = [];
  const allowedKeys = validKeys && validKeys.length > 0 ? new Set(validKeys) : null;

  for (const action of decision.actions) {
    if (action.action === 'none') {
      continue;
    }

    const key = 'key' in action ? normalizeMemoryKey(action.key) : '';

    if (allowedKeys && !allowedKeys.has(key)) {
      logger.warn(
        `Gemma memory decision skipped invalid key "${action.key}" normalized to "${key}". Valid keys: ${validKeys?.join(', ')}`,
      );
      continue;
    }

    if (action.action === 'delete') {
      const result = await deleteMemory({ userId, key });
      if (result.ok) {
        const attachment = createMemoryAttachment({
          key,
          type: 'delete',
          messageId,
          conversationId,
        });
        emitMemoryAttachment({ res, streamId, attachment });
        attachments.push(attachment);
      }
      continue;
    }

    const tokenCount = Tokenizer.getTokenCount(action.value, 'o200k_base');
    if (tokenLimit && totalTokens != null && totalTokens + tokenCount > tokenLimit) {
      const attachment = createMemoryAttachment({
        key: 'system',
        type: 'error',
        value: JSON.stringify({
          errorType: 'would_exceed',
          tokenCount: totalTokens + tokenCount - tokenLimit,
          totalTokens: totalTokens + tokenCount,
          tokenLimit,
        }),
        tokenCount: totalTokens,
        messageId,
        conversationId,
      });
      emitMemoryAttachment({ res, streamId, attachment });
      attachments.push(attachment);
      continue;
    }

    try {
      const result = await setMemory({
        userId,
        key,
        value: action.value,
        tokenCount,
      });
      if (result.ok) {
        const attachment = createMemoryAttachment({
          key,
          value: action.value,
          type: 'update',
          tokenCount,
          messageId,
          conversationId,
        });
        emitMemoryAttachment({ res, streamId, attachment });
        attachments.push(attachment);
      }
    } catch (error) {
      logger.error('[MemoryAgent] Failed to apply Gemma memory action', {
        key,
        action: action.action,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return attachments;
}

/**
 * Creates a memory tool instance with user context
 */
export const createMemoryTool = ({
  userId,
  setMemory,
  validKeys,
  tokenLimit,
  totalTokens = 0,
}: {
  userId: string | ObjectId;
  setMemory: MemoryMethods['setMemory'];
  validKeys?: string[];
  tokenLimit?: number;
  totalTokens?: number;
}) => {
  const remainingTokens = tokenLimit ? tokenLimit - totalTokens : Infinity;
  const isOverflowing = tokenLimit ? remainingTokens <= 0 : false;

  return tool(
    async ({ key, value }) => {
      try {
        if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
          logger.warn(
            `Memory Agent failed to set memory: Invalid key "${key}". Must be one of: ${validKeys.join(
              ', ',
            )}`,
          );
          return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
        }

        const tokenCount = Tokenizer.getTokenCount(value, 'o200k_base');

        if (isOverflowing) {
          const errorArtifact: Record<Tools.memory, MemoryArtifact> = {
            [Tools.memory]: {
              key: 'system',
              type: 'error',
              value: JSON.stringify({
                errorType: 'already_exceeded',
                tokenCount: Math.abs(remainingTokens),
                totalTokens: totalTokens,
                tokenLimit: tokenLimit!,
              }),
              tokenCount: totalTokens,
            },
          };
          return [`Memory storage exceeded. Cannot save new memories.`, errorArtifact];
        }

        if (tokenLimit) {
          const newTotalTokens = totalTokens + tokenCount;
          const newRemainingTokens = tokenLimit - newTotalTokens;

          if (newRemainingTokens < 0) {
            const errorArtifact: Record<Tools.memory, MemoryArtifact> = {
              [Tools.memory]: {
                key: 'system',
                type: 'error',
                value: JSON.stringify({
                  errorType: 'would_exceed',
                  tokenCount: Math.abs(newRemainingTokens),
                  totalTokens: newTotalTokens,
                  tokenLimit,
                }),
                tokenCount: totalTokens,
              },
            };
            return [`Memory storage would exceed limit. Cannot save this memory.`, errorArtifact];
          }
        }

        const artifact: Record<Tools.memory, MemoryArtifact> = {
          [Tools.memory]: {
            key,
            value,
            tokenCount,
            type: 'update',
          },
        };

        const result = await setMemory({ userId, key, value, tokenCount });
        if (result.ok) {
          logger.debug(`Memory set for key "${key}" (${tokenCount} tokens) for user "${userId}"`);
          return [`Memory set for key "${key}" (${tokenCount} tokens)`, artifact];
        }
        logger.warn(`Failed to set memory for key "${key}" for user "${userId}"`);
        return [`Failed to set memory for key "${key}"`, undefined];
      } catch (error) {
        logger.error('Memory Agent failed to set memory', error);
        return [`Error setting memory for key "${key}"`, undefined];
      }
    },
    {
      name: 'set_memory',
      description: 'Saves important information about the user into memory.',
      responseFormat: 'content_and_artifact',
      schema: z.object({
        key: z
          .string()
          .describe(
            validKeys && validKeys.length > 0
              ? `The key of the memory value. Must be one of: ${validKeys.join(', ')}`
              : 'The key identifier for this memory',
          ),
        value: z
          .string()
          .describe(
            'Value MUST be a complete sentence that fully describes relevant user information.',
          ),
      }),
    },
  );
};

/**
 * Creates a delete memory tool instance with user context
 */
const createDeleteMemoryTool = ({
  userId,
  deleteMemory,
  validKeys,
}: {
  userId: string | ObjectId;
  deleteMemory: MemoryMethods['deleteMemory'];
  validKeys?: string[];
}) => {
  return tool(
    async ({ key }) => {
      try {
        if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
          logger.warn(
            `Memory Agent failed to delete memory: Invalid key "${key}". Must be one of: ${validKeys.join(
              ', ',
            )}`,
          );
          return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
        }

        const artifact: Record<Tools.memory, MemoryArtifact> = {
          [Tools.memory]: {
            key,
            type: 'delete',
          },
        };

        const result = await deleteMemory({ userId, key });
        if (result.ok) {
          logger.debug(`Memory deleted for key "${key}" for user "${userId}"`);
          return [`Memory deleted for key "${key}"`, artifact];
        }
        logger.warn(`Failed to delete memory for key "${key}" for user "${userId}"`);
        return [`Failed to delete memory for key "${key}"`, undefined];
      } catch (error) {
        logger.error('Memory Agent failed to delete memory', error);
        return [`Error deleting memory for key "${key}"`, undefined];
      }
    },
    {
      name: 'delete_memory',
      description:
        'Deletes specific memory data about the user using the provided key. For updating existing memories, use the `set_memory` tool instead',
      responseFormat: 'content_and_artifact',
      schema: z.object({
        key: z
          .string()
          .describe(
            validKeys && validKeys.length > 0
              ? `The key of the memory to delete. Must be one of: ${validKeys.join(', ')}`
              : 'The key identifier of the memory to delete',
          ),
      }),
    },
  );
};
export class BasicToolEndHandler implements EventHandler {
  private callback?: ToolEndCallback;
  constructor(callback?: ToolEndCallback) {
    this.callback = callback;
  }

  handle(
    event: string,
    data: StreamEventData | undefined,
    metadata?: Record<string, unknown>,
  ): void {
    if (!metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }
    const toolEndData = data as ToolEndData | undefined;
    if (!toolEndData?.output) {
      console.warn('No output found in tool_end event');
      return;
    }
    this.callback?.(toolEndData, metadata);
  }
}

export async function processMemory({
  res,
  userId,
  setMemory,
  deleteMemory,
  messages,
  memory,
  messageId,
  conversationId,
  validKeys,
  instructions,
  llmConfig,
  tokenLimit,
  totalTokens = 0,
  streamId = null,
  user,
}: {
  res: ServerResponse;
  setMemory: MemoryMethods['setMemory'];
  deleteMemory: MemoryMethods['deleteMemory'];
  userId: string | ObjectId;
  memory: string;
  messageId: string;
  conversationId: string;
  messages: BaseMessage[];
  validKeys?: string[];
  instructions: string;
  tokenLimit?: number;
  totalTokens?: number;
  llmConfig?: Partial<LLMConfig>;
  streamId?: string | null;
  user?: IUser;
}): Promise<(TAttachment | null)[] | undefined> {
  try {
    const memoryTool = createMemoryTool({
      userId,
      tokenLimit,
      setMemory,
      validKeys,
      totalTokens,
    });
    const deleteMemoryTool = createDeleteMemoryTool({
      userId,
      validKeys,
      deleteMemory,
    });

    const currentMemoryTokens = totalTokens;

    let memoryStatus = `# Existing memory:\n${memory ?? 'No existing memories'}`;

    if (tokenLimit) {
      const remainingTokens = tokenLimit - currentMemoryTokens;
      memoryStatus = `# Memory Status:
Current memory usage: ${currentMemoryTokens} tokens
Token limit: ${tokenLimit} tokens
Remaining capacity: ${remainingTokens} tokens

# Existing memory:
${memory ?? 'No existing memories'}`;
    }

    const defaultLLMConfig: LLMConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4.1-mini',
      temperature: 0.4,
      streaming: false,
      disableStreaming: true,
    };

    const finalLLMConfig: ClientOptions = {
      ...defaultLLMConfig,
      ...llmConfig,
      /**
       * Ensure streaming is always disabled for memory processing
       */
      streaming: false,
      disableStreaming: true,
    };

    // Handle GPT-5+ models
    if ('model' in finalLLMConfig && /\bgpt-[5-9](?:\.\d+)?\b/i.test(finalLLMConfig.model ?? '')) {
      // Remove temperature for GPT-5+ models
      delete finalLLMConfig.temperature;

      // Move maxTokens to modelKwargs for GPT-5+ models
      if ('maxTokens' in finalLLMConfig && finalLLMConfig.maxTokens != null) {
        const modelKwargs = (finalLLMConfig as OpenAIClientOptions).modelKwargs ?? {};
        const paramName =
          (finalLLMConfig as OpenAIClientOptions).useResponsesApi === true
            ? 'max_output_tokens'
            : 'max_completion_tokens';
        modelKwargs[paramName] = finalLLMConfig.maxTokens;
        delete finalLLMConfig.maxTokens;
        (finalLLMConfig as OpenAIClientOptions).modelKwargs = modelKwargs;
      }
    }

    const bedrockConfig = finalLLMConfig as {
      additionalModelRequestFields?: { thinking?: unknown };
      temperature?: number;
    };
    if (
      llmConfig?.provider === Providers.BEDROCK &&
      bedrockConfig.additionalModelRequestFields?.thinking != null &&
      bedrockConfig.temperature != null
    ) {
      (finalLLMConfig as unknown as Record<string, unknown>).temperature = 1;
    }

    const anthropicConfig = finalLLMConfig as {
      thinking?: { type?: string };
      temperature?: number;
    };
    if (
      llmConfig?.provider === Providers.ANTHROPIC &&
      anthropicConfig.thinking?.type === 'enabled' &&
      anthropicConfig.temperature != null
    ) {
      delete (finalLLMConfig as Record<string, unknown>).temperature;
    }

    if (isOllamaGemmaMemoryProcessor(llmConfig)) {
      return await processGemmaMemory({
        res,
        userId,
        setMemory,
        deleteMemory,
        messages,
        memoryStatus,
        messageId,
        conversationId,
        validKeys,
        instructions,
        llmConfig: finalLLMConfig,
        tokenLimit,
        totalTokens,
        user,
        streamId,
      });
    }

    const llmConfigWithHeaders = finalLLMConfig as OpenAIClientOptions;
    if (llmConfigWithHeaders?.configuration?.defaultHeaders != null) {
      llmConfigWithHeaders.configuration.defaultHeaders = resolveHeaders({
        headers: llmConfigWithHeaders.configuration.defaultHeaders as Record<string, string>,
        user: user ? createSafeUser(user) : undefined,
      });
    }

    const artifactPromises: Promise<TAttachment | null>[] = [];
    const memoryCallback = createMemoryCallback({ res, artifactPromises, streamId });
    const customHandlers = {
      [GraphEvents.TOOL_END]: new BasicToolEndHandler(memoryCallback),
    };

    /**
     * For Bedrock provider, include instructions in the user message instead of as a system prompt.
     * Bedrock's Converse API requires conversations to start with a user message, not a system message.
     * Other providers can use the standard system prompt approach.
     */
    const isBedrock = llmConfig?.provider === Providers.BEDROCK;

    let graphInstructions: string | undefined = instructions;
    let graphAdditionalInstructions: string | undefined = memoryStatus;
    let processedMessages = messages;

    if (isBedrock) {
      const combinedInstructions = [instructions, memoryStatus].filter(Boolean).join('\n\n');

      if (messages.length > 0) {
        const firstMessage = messages[0];
        const originalContent =
          typeof firstMessage.content === 'string' ? firstMessage.content : '';

        if (typeof firstMessage.content !== 'string') {
          logger.warn(
            'Bedrock memory processing: First message has non-string content, using empty string',
          );
        }

        const bedrockUserMessage = new HumanMessage(
          `${combinedInstructions}\n\n${originalContent}`,
        );
        processedMessages = [bedrockUserMessage, ...messages.slice(1)];
      } else {
        processedMessages = [new HumanMessage(combinedInstructions)];
      }

      graphInstructions = undefined;
      graphAdditionalInstructions = undefined;
    }

    const run = await Run.create({
      runId: messageId,
      graphConfig: {
        type: 'standard',
        llmConfig: finalLLMConfig,
        tools: [memoryTool, deleteMemoryTool],
        instructions: graphInstructions,
        additional_instructions: graphAdditionalInstructions,
        toolEnd: true,
      },
      customHandlers,
      returnContent: true,
    });

    const config = {
      runName: 'MemoryRun',
      configurable: {
        user_id: userId,
        thread_id: conversationId,
        provider: llmConfig?.provider,
      },
      streamMode: 'values',
      recursionLimit: 3,
      version: 'v2',
    } as const;

    const inputs = {
      messages: processedMessages,
    };
    const content = await run.processStream(inputs, config);
    if (content) {
      logger.debug('[MemoryAgent] Processed successfully', {
        userId,
        conversationId,
        messageId,
        provider: llmConfig?.provider,
      });
    } else {
      logger.debug('[MemoryAgent] Returned no content', { userId, conversationId, messageId });
    }
    return await Promise.all(artifactPromises);
  } catch (error) {
    logger.error(
      `[MemoryAgent] Failed to process memory | userId: ${userId} | conversationId: ${conversationId} | messageId: ${messageId}`,
      { error },
    );
  }
}

export async function createMemoryProcessor({
  res,
  userId,
  messageId,
  memoryMethods,
  conversationId,
  config = {},
  streamId = null,
  user,
}: {
  res: ServerResponse;
  messageId: string;
  conversationId: string;
  userId: string | ObjectId;
  memoryMethods: RequiredMemoryMethods;
  config?: MemoryConfig;
  streamId?: string | null;
  user?: IUser;
}): Promise<[string, (messages: BaseMessage[]) => Promise<(TAttachment | null)[] | undefined>]> {
  const { validKeys, instructions, llmConfig, tokenLimit } = config;
  const finalInstructions = instructions || getDefaultInstructions(validKeys, tokenLimit);

  const { withKeys, withoutKeys, totalTokens } = await memoryMethods.getFormattedMemories({
    userId,
  });

  return [
    withoutKeys,
    async function (messages: BaseMessage[]): Promise<(TAttachment | null)[] | undefined> {
      try {
        return await processMemory({
          res,
          userId,
          messages,
          validKeys,
          llmConfig,
          messageId,
          tokenLimit,
          streamId,
          conversationId,
          memory: withKeys,
          totalTokens: totalTokens || 0,
          instructions: finalInstructions,
          setMemory: memoryMethods.setMemory,
          deleteMemory: memoryMethods.deleteMemory,
          user,
        });
      } catch (error) {
        logger.error('Memory Agent failed to process memory', error);
      }
    },
  ];
}

async function handleMemoryArtifact({
  res,
  data,
  metadata,
  streamId = null,
}: {
  res: ServerResponse;
  data: ToolEndData;
  metadata?: ToolEndMetadata;
  streamId?: string | null;
}) {
  const output = data?.output as ToolMessage | undefined;
  if (!output) {
    return null;
  }

  if (!output.artifact) {
    return null;
  }

  const memoryArtifact = output.artifact[Tools.memory] as MemoryArtifact | undefined;
  if (!memoryArtifact) {
    return null;
  }

  const attachment: Partial<TAttachment> = {
    type: Tools.memory,
    toolCallId: output.tool_call_id,
    messageId: metadata?.run_id ?? '',
    conversationId: metadata?.thread_id ?? '',
    [Tools.memory]: memoryArtifact,
  };
  if (!res.headersSent) {
    return attachment;
  }
  if (streamId) {
    GenerationJobManager.emitChunk(streamId, { event: 'attachment', data: attachment });
  } else {
    res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
  }
  return attachment;
}

/**
 * Creates a memory callback for handling memory artifacts
 * @param params - The parameters object
 * @param params.res - The server response object
 * @param params.artifactPromises - Array to collect artifact promises
 * @param params.streamId - The stream ID for resumable mode, or null for standard mode
 * @returns The memory callback function
 */
export function createMemoryCallback({
  res,
  artifactPromises,
  streamId = null,
}: {
  res: ServerResponse;
  artifactPromises: Promise<Partial<TAttachment> | null>[];
  streamId?: string | null;
}): ToolEndCallback {
  return async (data: ToolEndData, metadata?: Record<string, unknown>) => {
    const output = data?.output as ToolMessage | undefined;
    const memoryArtifact = output?.artifact?.[Tools.memory] as MemoryArtifact;
    if (memoryArtifact == null) {
      return;
    }
    artifactPromises.push(
      handleMemoryArtifact({ res, data, metadata, streamId }).catch((error) => {
        logger.error('Error processing memory artifact content:', error);
        return null;
      }),
    );
  };
}
