import {
  MemoryCache,
  MockProvider,
  Toka,
  TokaConfigurationError,
  createTokaWithSampleConfig,
} from '../src';

describe('Toka public API', () => {
  it('initializes with validated config and exposes complete()', async () => {
    const toka = createTokaWithSampleConfig();
    const result = await toka.complete({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result.provider).toBe('mock');
    expect(result.modelUsed).toBe('gpt-4');
    expect(result.costSource).toBe('estimated');
  });

  it('retains request() as an intentional compatibility wrapper', async () => {
    const result = await new Toka(
      { models: ['demo'], maxCostPerRequest: 1 },
      undefined,
      new MockProvider()
    ).request('demo', 'Hello');
    expect(result.tokens).toBe(result.totalTokens);
  });

  it('supports async cache integration', async () => {
    const toka = new Toka(
      { models: ['demo'], maxCostPerRequest: 1 },
      new MemoryCache()
    );
    const request = {
      model: 'demo',
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };
    expect((await toka.complete(request)).cacheHit).toBe(false);
    expect((await toka.complete(request)).cacheHit).toBe(true);
  });

  it('rejects malformed configuration', () => {
    expect(() => new Toka({ models: [], maxCostPerRequest: 1 })).toThrow(
      TokaConfigurationError
    );
    expect(() => new Toka({ models: ['demo'], maxCostPerRequest: 0 })).toThrow(
      TokaConfigurationError
    );
  });
});
