const { z } = require('zod');
const axios = require('axios');
const { Ollama } = require('ollama');
const { sleep } = require('@librechat/agents');
const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { resolveHeaders, deriveBaseURL } = require('@librechat/api');

const ollamaPayloadSchema = z.object({
  mirostat: z.number().optional(),
  mirostat_eta: z.number().optional(),
  mirostat_tau: z.number().optional(),
  num_ctx: z.number().optional(),
  repeat_last_n: z.number().optional(),
  repeat_penalty: z.number().optional(),
  temperature: z.number().optional(),
  seed: z.number().nullable().optional(),
  stop: z.array(z.string()).optional(),
  tfs_z: z.number().optional(),
  num_predict: z.number().optional(),
  top_k: z.number().optional(),
  top_p: z.number().optional(),
  stream: z.optional(z.boolean()),
  model: z.string(),
});

/**
 * @param {string} imageUrl
 * @returns {string}
 * @throws {Error}
 */
const getValidBase64 = (imageUrl) => {
  if (typeof imageUrl !== 'string') {
    return;
  }

  const parts = imageUrl.split(';base64,');

  if (parts.length === 2) {
    return parts[1];
  }
};

const normalizeRole = (role) => {
  if (role === 'developer') {
    return 'system';
  }

  if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
    return role;
  }

  return 'user';
};

const appendTextContent = (textParts, value) => {
  if (typeof value === 'string' && value.trim() !== '') {
    textParts.push(value.trim());
  }
};

class OllamaClient {
  constructor(options = {}) {
    const host = deriveBaseURL(options.baseURL ?? 'http://localhost:11434');
    this.streamRate = options.streamRate ?? Constants.DEFAULT_STREAM_RATE;
    this.headers = options.headers ?? {};
    /** @type {Ollama} */
    this.client = new Ollama({ host });
  }

  /**
   * Fetches Ollama models from the specified base API path.
   * @param {string} baseURL
   * @param {Object} [options] - Optional configuration
   * @param {Partial<IUser>} [options.user] - User object for header resolution
   * @param {Record<string, string>} [options.headers] - Headers to include in the request
   * @returns {Promise<string[]>} The Ollama models.
   * @throws {Error} Throws if the Ollama API request fails
   */
  static async fetchModels(baseURL, options = {}) {
    if (!baseURL) {
      return [];
    }

    const ollamaEndpoint = deriveBaseURL(baseURL);

    const resolvedHeaders = resolveHeaders({
      headers: options.headers,
      user: options.user,
    });

    /** @type {Promise<AxiosResponse<OllamaListResponse>>} */
    const response = await axios.get(`${ollamaEndpoint}/api/tags`, {
      headers: resolvedHeaders,
      timeout: 5000,
    });

    const models = response.data.models.map((tag) => tag.name);
    return models;
  }

  /**
   * @param {ChatCompletionMessage[]} messages
   * @returns {OllamaMessage[]}
   */
  static formatOpenAIMessages(messages) {
    const ollamaMessages = [];

    for (const message of messages) {
      const role = normalizeRole(message.role);

      if (typeof message.content === 'string') {
        const ollamaMessage = {
          role,
          content: message.content,
        };
        if (message.tool_calls) {
          ollamaMessage.tool_calls = message.tool_calls;
        }
        if (role === 'tool') {
          ollamaMessage.tool_name = message.name;
        }
        ollamaMessages.push(ollamaMessage);
        continue;
      }

      const textParts = [];
      let imageUrls = [];

      const contentList = Array.isArray(message.content) ? message.content : [];

      if (!Array.isArray(message.content)) {
        const ollamaMessage = {
          role,
          content: message.content ?? '',
        };
        if (message.tool_calls) {
          ollamaMessage.tool_calls = message.tool_calls;
        }
        if (role === 'tool') {
          ollamaMessage.tool_name = message.name;
        }
        ollamaMessages.push(ollamaMessage);
        continue;
      }

      for (const content of contentList) {
        if (typeof content === 'string') {
          appendTextContent(textParts, content);
        } else if (content?.type === 'text' || content?.type === 'input_text') {
          appendTextContent(textParts, content.text);
        } else if (content?.type === 'image_url') {
          const imageBase64 = getValidBase64(content.image_url?.url);
          if (imageBase64) {
            imageUrls.push(imageBase64);
          }
        } else {
          appendTextContent(textParts, content?.text);
        }
      }

      const ollamaMessage = {
        role,
        content: textParts.join('\n\n'),
      };

      if (message.tool_calls) {
        ollamaMessage.tool_calls = message.tool_calls;
      }

      if (role === 'tool') {
        ollamaMessage.tool_name = message.name;
      }

      if (imageUrls.length > 0) {
        ollamaMessage.images = imageUrls;
      }

      if (ollamaMessage.content === '' && !ollamaMessage.images) {
        continue;
      }

      ollamaMessages.push(ollamaMessage);
    }

    return ollamaMessages;
  }

  /***
   * @param {Object} params
   * @param {ChatCompletionPayload} params.payload
   * @param {onTokenProgress} params.onProgress
   * @param {AbortController} params.abortController
   */
  async chatCompletion({ payload, onProgress, abortController = null }) {
    let intermediateReply = '';

    const parameters = ollamaPayloadSchema.parse(payload);
    const messages = OllamaClient.formatOpenAIMessages(payload.messages);

    if (parameters.stream) {
      const stream = await this.client.chat({
        messages,
        ...parameters,
      });

      for await (const chunk of stream) {
        const token = chunk.message.content;
        intermediateReply += token;
        onProgress(token);
        if (abortController.signal.aborted) {
          stream.controller.abort();
          break;
        }

        await sleep(this.streamRate);
      }
    }
    // TODO: regular completion
    else {
      // const generation = await this.client.generate(payload);
    }

    return intermediateReply;
  }
  catch(err) {
    logger.error('[OllamaClient.chatCompletion]', err);
    throw err;
  }
}

module.exports = { OllamaClient, ollamaPayloadSchema };
