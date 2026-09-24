import { OpenAIProvider } from '../src';
import {
  Toka,
  TokaAuthenticationError,
  TokaInvalidModelError,
  TokaInvalidRequestError,
  TokaRateLimitError,
  TokaTimeoutError,
} from '../src';

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('OpenAIProvider', () => {
  it('constructs the request and normalizes actual usage and model', async () => {
    let request: RequestInit | undefined;
    let url = '';
    const provider = new OpenAIProvider({
      apiKey: 'secret-key',
      fetchImpl: (async (input, init) => {
        url = String(input);
        request = init;
        return response({
          model: 'gpt-4o-mini-2026',
          choices: [{ message: { content: 'Hi' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        });
      }) as typeof fetch,
    });
    const result = await provider.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.2,
      maxTokens: 20,
    });
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0].content).toBe('Hello');
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(20);
    expect(result).toMatchObject({
      provider: 'openai',
      modelUsed: 'gpt-4o-mini-2026',
      text: 'Hi',
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
        isEstimated: false,
      },
    });
  });

  it('handles missing usage without fabricating actual values', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'secret-key',
      fetchImpl: (async () =>
        response({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: 'Hi' } }],
        })) as typeof fetch,
    });
    const result = await provider.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.usage).toBeUndefined();
  });

  it('maps authentication, invalid model, and invalid request errors', async () => {
    await expect(
      new OpenAIProvider({
        fetchImpl: (async () => response({ error: {} }, 401)) as typeof fetch,
      }).complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(TokaAuthenticationError);
    await expect(
      new OpenAIProvider({
        apiKey: 'x',
        fetchImpl: (async () =>
          response(
            { error: { code: 'model_not_found' } },
            404
          )) as typeof fetch,
      }).complete({ model: 'bad', messages: [{ role: 'user', content: 'x' }] })
    ).rejects.toBeInstanceOf(TokaInvalidModelError);
    await expect(
      new OpenAIProvider({
        apiKey: 'x',
        fetchImpl: (async () =>
          response({ error: { message: 'bad request' } }, 400)) as typeof fetch,
      }).complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(TokaInvalidRequestError);
  });

  it('retries a rate limit, respects Retry-After, and succeeds', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const provider = new OpenAIProvider({
      apiKey: 'x',
      retry: { maxRetries: 1 },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1
          ? response({ error: {} }, 429, { 'retry-after': '0.01' })
          : response({
              model: 'gpt-4o-mini',
              choices: [{ message: { content: 'ok' } }],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
              },
            });
      }) as typeof fetch,
    });
    await expect(
      provider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).resolves.toHaveProperty('text', 'ok');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([10]);
  });

  it('does not retry authentication errors and maps timeout', async () => {
    let calls = 0;
    await expect(
      new OpenAIProvider({
        apiKey: 'x',
        retry: { maxRetries: 2 },
        sleep: async () => undefined,
        fetchImpl: (async () => {
          calls += 1;
          return response({}, 401);
        }) as typeof fetch,
      }).complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(TokaAuthenticationError);
    expect(calls).toBe(1);
    const timeoutProvider = new OpenAIProvider({
      apiKey: 'x',
      timeoutMs: 5,
      retry: { maxRetries: 0 },
      fetchImpl: (async (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        })) as typeof fetch,
    });
    await expect(
      timeoutProvider.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(TokaTimeoutError);
  });
});

describe('Toka with OpenAIProvider', () => {
  it('returns actual usage and actual input/output cost', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'x',
      fetchImpl: (async () =>
        response({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: 'ok' } }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
          },
        })) as typeof fetch,
    });
    const toka = new Toka(
      { models: ['gpt-4o-mini'], maxCostPerRequest: 1 },
      undefined,
      provider
    );
    await expect(
      toka.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).resolves.toMatchObject({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      inputCost: 0.00015,
      outputCost: 0.0003,
      cost: 0.00045,
      costSource: 'actual',
      provider: 'openai',
    });
  });

  it('rejects unknown pricing before making a provider request', async () => {
    const fetchMock = jest.fn(async () => response({}));
    const toka = new Toka(
      { models: ['example-model'], maxCostPerRequest: 1 },
      undefined,
      new OpenAIProvider({ apiKey: 'x', fetchImpl: fetchMock as typeof fetch })
    );
    await expect(
      toka.complete({
        model: 'example-model',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toMatchObject({
      code: 'PRICING_ERROR',
      provider: 'openai',
      model: 'example-model',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
