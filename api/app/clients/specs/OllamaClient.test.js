const { OllamaClient } = require('../OllamaClient');

describe('OllamaClient', () => {
  describe('formatOpenAIMessages', () => {
    it('keeps plain text messages in Ollama chat format', () => {
      const result = OllamaClient.formatOpenAIMessages([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
    });

    it('maps OpenAI developer messages to Ollama system messages', () => {
      const result = OllamaClient.formatOpenAIMessages([
        { role: 'developer', content: 'Follow system policy.' },
      ]);

      expect(result).toEqual([{ role: 'system', content: 'Follow system policy.' }]);
    });

    it('preserves tool messages in native Ollama chat format', () => {
      const result = OllamaClient.formatOpenAIMessages([
        { role: 'tool', name: 'web_search', content: 'Search result summary.' },
      ]);

      expect(result).toEqual([
        {
          role: 'tool',
          tool_name: 'web_search',
          content: 'Search result summary.',
        },
      ]);
    });

    it('preserves assistant tool calls in native Ollama chat format', () => {
      const result = OllamaClient.formatOpenAIMessages([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              function: {
                name: 'web_search',
                arguments: '{"query":"台北市今天天氣"}',
              },
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              function: {
                name: 'web_search',
                arguments: '{"query":"台北市今天天氣"}',
              },
            },
          ],
        },
      ]);
    });

    it('converts mixed text and base64 image content to Ollama message fields', () => {
      const result = OllamaClient.formatOpenAIMessages([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: 'Describe this image.',
          images: ['abc123'],
        },
      ]);
    });

    it('skips unsupported non-base64 image URLs instead of sending invalid images', () => {
      const result = OllamaClient.formatOpenAIMessages([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Continue.' },
            { type: 'image_url', image_url: { url: '/images/file.png' } },
          ],
        },
      ]);

      expect(result).toEqual([{ role: 'user', content: 'Continue.' }]);
    });

    it('drops empty messages after unsupported content is removed', () => {
      const result = OllamaClient.formatOpenAIMessages([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: '/images/file.png' } }],
        },
        { role: 'user', content: 'Next message' },
      ]);

      expect(result).toEqual([{ role: 'user', content: 'Next message' }]);
    });
  });
});
