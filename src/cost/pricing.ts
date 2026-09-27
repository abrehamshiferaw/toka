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
  {
    provider: 'openai',
    model: 'gpt-4',
    inputPricePerMillionTokens: 30,
    outputPricePerMillionTokens: 60,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'o1',
    inputPricePerMillionTokens: 15,
    outputPricePerMillionTokens: 60,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'openai',
    model: 'o3-mini',
    inputPricePerMillionTokens: 1.1,
    outputPricePerMillionTokens: 4.4,
    currency: 'USD',
    version: '2026-09',
  },
];

const ANTHROPIC_PRICING: readonly ModelPricing[] = [
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    inputPricePerMillionTokens: 3.0,
    outputPricePerMillionTokens: 15.0,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    inputPricePerMillionTokens: 3.0,
    outputPricePerMillionTokens: 15.0,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku',
    inputPricePerMillionTokens: 0.8,
    outputPricePerMillionTokens: 4.0,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus',
    inputPricePerMillionTokens: 15.0,
    outputPricePerMillionTokens: 75.0,
    currency: 'USD',
    version: '2026-09',
  },
];

const GEMINI_PRICING: readonly ModelPricing[] = [
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    inputPricePerMillionTokens: 0.075,
    outputPricePerMillionTokens: 0.3,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    inputPricePerMillionTokens: 0.075,
    outputPricePerMillionTokens: 0.3,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'gemini',
    model: 'gemini-flash-latest',
    inputPricePerMillionTokens: 0.075,
    outputPricePerMillionTokens: 0.3,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    inputPricePerMillionTokens: 1.25,
    outputPricePerMillionTokens: 5.0,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    inputPricePerMillionTokens: 1.25,
    outputPricePerMillionTokens: 5.0,
    currency: 'USD',
    version: '2026-09',
  },
];

const DEEPSEEK_PRICING: readonly ModelPricing[] = [
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    inputPricePerMillionTokens: 0.14,
    outputPricePerMillionTokens: 0.28,
    currency: 'USD',
    version: '2026-09',
  },
  {
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    inputPricePerMillionTokens: 0.55,
    outputPricePerMillionTokens: 2.19,
    currency: 'USD',
    version: '2026-09',
  },
];

const ALL_PRICING: readonly ModelPricing[] = [
  ...OPENAI_PRICING,
  ...ANTHROPIC_PRICING,
  ...GEMINI_PRICING,
  ...DEEPSEEK_PRICING,
];

export const defaultPricingRegistry = new Map(
  ALL_PRICING.map((pricing) => [
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
