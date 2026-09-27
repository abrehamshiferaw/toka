import {
  AnthropicProvider,
  GeminiProvider,
  MultiProvider,
  OpenAIProvider,
  MockProvider,
  TokaAuthenticationError,
  TokaInvalidModelError,
  TokaInvalidRequestError,
} from '../src';

describe('Production AI Providers', () => {
  describe('AnthropicProvider', () => {
    it('initializes with default options', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.name).toBe('anthropic');
    });

    it('throws TokaAuthenticationError if apiKey is missing', async () => {
      const oldKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const provider = new AnthropicProvider();
        await expect(
          provider.complete({
            model: 'claude-3-5-sonnet',
            messages: [{ role: 'user', content: 'hello' }],
          })
        ).rejects.toThrow(TokaAuthenticationError);
      } finally {
        if (oldKey) process.env.ANTHROPIC_API_KEY = oldKey;
      }
    });

    it('sends proper payload and parses Claude response', async () => {
      const mockFetch: typeof fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'Hello! I am Claude.' }],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
      } as any);

      const provider = new AnthropicProvider({
        apiKey: 'test-anthropic-key',
        fetchImpl: mockFetch,
      });

      const response = await provider.complete({
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'system', content: 'You are an assistant.' },
          { role: 'user', content: 'Hi there' },
        ],
      });

      expect(response.text).toBe('Hello! I am Claude.');
      expect(response.modelUsed).toBe('claude-3-5-sonnet-20241022');
      expect(response.usage?.inputTokens).toBe(12);
      expect(response.usage?.outputTokens).toBe(8);
      expect(response.usage?.totalTokens).toBe(20);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('GeminiProvider', () => {
    it('initializes with default options', () => {
      const provider = new GeminiProvider({ apiKey: 'test-gemini-key' });
      expect(provider.name).toBe('gemini');
    });

    it('throws TokaAuthenticationError if apiKey is missing', async () => {
      const oldKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const provider = new GeminiProvider();
        await expect(
          provider.complete({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'hello' }],
          })
        ).rejects.toThrow(TokaAuthenticationError);
      } finally {
        if (oldKey) process.env.GEMINI_API_KEY = oldKey;
      }
    });

    it('sends proper payload and parses Gemini response', async () => {
      const mockFetch: typeof fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from Google Gemini!' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 10,
            totalTokenCount: 25,
          },
        }),
      } as any);

      const provider = new GeminiProvider({
        apiKey: 'test-gemini-key',
        fetchImpl: mockFetch,
      });

      const response = await provider.complete({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      expect(response.text).toBe('Hello from Google Gemini!');
      expect(response.modelUsed).toBe('gemini-2.5-flash');
      expect(response.usage?.inputTokens).toBe(15);
      expect(response.usage?.outputTokens).toBe(10);
      expect(response.usage?.totalTokens).toBe(25);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('MultiProvider', () => {
    it('resolves correct provider based on model family', () => {
      const multi = new MultiProvider({
        allowMockFallback: true,
      });

      expect(multi.resolveProviderForModel('gpt-4o').name).toBe('openai');
      expect(multi.resolveProviderForModel('o1-mini').name).toBe('openai');
      expect(multi.resolveProviderForModel('claude-3-5-sonnet').name).toBe('anthropic');
      expect(multi.resolveProviderForModel('claude-3-opus').name).toBe('anthropic');
      expect(multi.resolveProviderForModel('gemini-2.5-flash').name).toBe('gemini');
      expect(multi.resolveProviderForModel('deepseek-chat').name).toBe('openai'); // deepseek mapped via OpenAIProvider adapter
      expect(multi.resolveProviderForModel('mock-fast').name).toBe('mock');
    });

    it('delegates completion to matched provider', async () => {
      const mock = new MockProvider();
      const multi = new MultiProvider({
        providers: { mock },
        defaultProvider: 'mock',
      });

      const response = await multi.complete({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'Test prompt' }],
      });

      expect(response.text).toBeDefined();
      expect(response.modelUsed).toBe('mock-model');
    });

    it('throws error when model is missing', async () => {
      const multi = new MultiProvider();
      await expect(
        multi.complete({
          model: '',
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow(TokaInvalidRequestError);
    });
  });
});
