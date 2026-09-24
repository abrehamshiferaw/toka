import { calculateCost, getPricing } from '../src/cost/pricing';
import { TokaPricingError } from '../src';

describe('pricing registry', () => {
  it('looks up built-in OpenAI pricing', () => {
    expect(getPricing('openai', 'gpt-4o-mini')).toMatchObject({
      inputPricePerMillionTokens: 0.15,
      outputPricePerMillionTokens: 0.6,
    });
  });

  it('calculates input and output cost separately with exact arithmetic', () => {
    const pricing = getPricing('openai', 'gpt-4o-mini');
    expect(calculateCost(pricing, 1200, 400, 'actual')).toEqual({
      inputCost: 0.00018,
      outputCost: 0.00024,
      cost: 0.00042,
      costSource: 'actual',
    });
  });

  it('handles zero and large token counts', () => {
    const pricing = getPricing('openai', 'gpt-4.1-mini');
    expect(calculateCost(pricing, 0, 0, 'actual').cost).toBe(0);
    expect(calculateCost(pricing, 1_000_000, 2_000_000, 'actual').cost).toBe(
      3.6
    );
  });

  it('allows custom pricing to override built-in pricing', () => {
    const pricing = getPricing('openai', 'gpt-4o-mini', {
      'openai:gpt-4o-mini': {
        inputPricePerMillionTokens: 1,
        outputPricePerMillionTokens: 2,
      },
    });
    expect(calculateCost(pricing, 100, 50, 'actual').cost).toBe(0.0002);
  });

  it('rejects unknown provider/model instead of applying a default price', () => {
    expect(() => getPricing('unknown', 'unknown-model')).toThrow(
      TokaPricingError
    );
    expect(() => getPricing('openai', 'unknown-model')).toThrow(
      /provider 'openai' and model 'unknown-model'/
    );
  });
});
