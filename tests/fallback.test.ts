import { Toka, MockProvider } from '../src';

describe('Phase 1 provider behavior', () => {
  it('returns deterministic simulated responses from MockProvider', async () => {
    const provider = new MockProvider();
    const request = {
      model: 'demo',
      messages: [{ role: 'user' as const, content: 'hello' }],
    };
    await expect(provider.complete(request)).resolves.toEqual(
      await provider.complete(request)
    );
  });

  it('rejects an estimated request over the configured budget', async () => {
    const toka = new Toka({ models: ['demo'], maxCostPerRequest: 0.000001 });
    await expect(
      toka.complete({
        model: 'demo',
        messages: [
          {
            role: 'user',
            content: 'A long enough prompt to exceed the budget.',
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
  });
});
