import { TokaPricingError } from '../errors';

export interface ModelPricing {
  provider: string;
  model: string;
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  currency: 'USD';
  effectiveFrom?: string;
  version?: string;
}

export interface PricingOverride {
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  currency?: 'USD';
  effectiveFrom?: string;
  version?: string;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cost: number;
  costSource: 'actual' | 'estimated';
}

// Standard prices per 1M tokens from https://developers.openai.com/api/docs/pricing.
const OPENAI_PRICING: readonly ModelPricing[] = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPricePerMillionTokens: 0.15,
    outputPricePerMillionTokens: 0.6,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPricePerMillionTokens: 2.5,
    outputPricePerMillionTokens: 10,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1',
    inputPricePerMillionTokens: 2,
    outputPricePerMillionTokens: 8,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputPricePerMillionTokens: 0.4,
    outputPricePerMillionTokens: 1.6,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    inputPricePerMillionTokens: 0.1,
    outputPricePerMillionTokens: 0.4,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputPricePerMillionTokens: 0.5,
    outputPricePerMillionTokens: 1.5,
    currency: 'USD',
    version: '2026-09',
  },
];

export const defaultPricingRegistry = new Map(
  OPENAI_PRICING.map((pricing) => [
    `${pricing.provider}:${pricing.model}`,
    pricing,
  ])
);

export function getPricing(
  provider: string,
  model: string,
  overrides: Record<string, PricingOverride> = {}
): ModelPricing {
  const key = `${provider}:${model}`;
  const override = overrides[key];
  if (override) return { provider, model, currency: 'USD', ...override };
  const pricing = defaultPricingRegistry.get(key);
  if (!pricing) throw new TokaPricingError(provider, model);
  return pricing;
}

export function calculateCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  source: 'actual' | 'estimated'
): CostBreakdown {
  if (
    ![inputTokens, outputTokens].every(
      (value) => Number.isFinite(value) && value >= 0
    )
  ) {
    throw new TokaPricingError(
      pricing.provider,
      pricing.model,
      'Token usage must be finite and non-negative.'
    );
  }
  const roundCost = (value: number): number => Number(value.toFixed(12));
  const inputCost = roundCost(
    (inputTokens / 1_000_000) * pricing.inputPricePerMillionTokens
  );
  const outputCost = roundCost(
    (outputTokens / 1_000_000) * pricing.outputPricePerMillionTokens
  );
  return {
    inputCost,
    outputCost,
    cost: roundCost(inputCost + outputCost),
    costSource: source,
  };
}
