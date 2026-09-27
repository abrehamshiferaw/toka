import { ModelCapability, ModelMetadata, QualityTier } from './types';

export const BUILTIN_MODELS: readonly ModelMetadata[] = [
  {
    provider: 'openai',
    model: 'gpt-4o',
    name: 'OpenAI GPT-4o (Omni Flagship)',
    pricing: {
      inputCostPerThousand: 0.0025,
      outputCostPerThousand: 0.01,
      cachedInputCostPerThousand: 0.00125,
      inputPricePerMillionTokens: 2.5,
      outputPricePerMillionTokens: 10,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'flagship',
    contextLimits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    name: 'OpenAI GPT-4o Mini (Fast & Affordable)',
    pricing: {
      inputCostPerThousand: 0.00015,
      outputCostPerThousand: 0.0006,
      cachedInputCostPerThousand: 0.000075,
      inputPricePerMillionTokens: 0.15,
      outputPricePerMillionTokens: 0.6,
    },
    capabilities: ['chat', 'code', 'vision', 'tools', 'json'],
    qualityTier: 'fast',
    contextLimits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4.1',
    name: 'OpenAI GPT-4.1 (Flagship Frontier)',
    pricing: {
      inputCostPerThousand: 0.002,
      outputCostPerThousand: 0.008,
      cachedInputCostPerThousand: 0.001,
      inputPricePerMillionTokens: 2.0,
      outputPricePerMillionTokens: 8.0,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'flagship',
    contextLimits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    name: 'OpenAI GPT-4.1 Mini (Standard Workhorse)',
    pricing: {
      inputCostPerThousand: 0.0004,
      outputCostPerThousand: 0.0016,
      cachedInputCostPerThousand: 0.0002,
      inputPricePerMillionTokens: 0.4,
      outputPricePerMillionTokens: 1.6,
    },
    capabilities: ['chat', 'code', 'tools', 'json', 'reasoning'],
    qualityTier: 'standard',
    contextLimits: {
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-nano',
    name: 'OpenAI GPT-4.1 Nano (Ultra Lightweight)',
    pricing: {
      inputCostPerThousand: 0.0001,
      outputCostPerThousand: 0.0004,
      cachedInputCostPerThousand: 0.00005,
      inputPricePerMillionTokens: 0.1,
      outputPricePerMillionTokens: 0.4,
    },
    capabilities: ['chat', 'tools', 'json'],
    qualityTier: 'economy',
    contextLimits: {
      maxContextTokens: 64000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    name: 'OpenAI GPT-3.5 Turbo',
    pricing: {
      inputCostPerThousand: 0.0005,
      outputCostPerThousand: 0.0015,
      inputPricePerMillionTokens: 0.5,
      outputPricePerMillionTokens: 1.5,
    },
    capabilities: ['chat', 'tools', 'json'],
    qualityTier: 'economy',
    contextLimits: {
      maxContextTokens: 16385,
      maxOutputTokens: 4096,
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4',
    name: 'OpenAI GPT-4 (Legacy Flagship)',
    pricing: {
      inputCostPerThousand: 0.03,
      outputCostPerThousand: 0.06,
      inputPricePerMillionTokens: 30,
      outputPricePerMillionTokens: 60,
    },
    capabilities: ['chat', 'code', 'reasoning', 'tools'],
    qualityTier: 'flagship',
    contextLimits: {
      maxContextTokens: 8192,
      maxOutputTokens: 4096,
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    name: 'Anthropic Claude 3.5 Sonnet (State-of-the-Art Code & Reasoning)',
    pricing: {
      inputCostPerThousand: 0.003,
      outputCostPerThousand: 0.015,
      cachedInputCostPerThousand: 0.0003,
      inputPricePerMillionTokens: 3.0,
      outputPricePerMillionTokens: 15.0,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'flagship',
    contextLimits: {
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku',
    name: 'Anthropic Claude 3.5 Haiku (Lightning Fast & Ultra Low Cost)',
    pricing: {
      inputCostPerThousand: 0.0008,
      outputCostPerThousand: 0.004,
      cachedInputCostPerThousand: 0.00008,
      inputPricePerMillionTokens: 0.8,
      outputPricePerMillionTokens: 4.0,
    },
    capabilities: ['chat', 'code', 'vision', 'tools', 'json'],
    qualityTier: 'fast',
    contextLimits: {
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    name: 'Google Gemini 3.8 Flash (High Speed & Ultra Affordable)',
    pricing: {
      inputCostPerThousand: 0.000075,
      outputCostPerThousand: 0.0003,
      cachedInputCostPerThousand: 0.00001875,
      inputPricePerMillionTokens: 0.075,
      outputPricePerMillionTokens: 0.3,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'fast',
    contextLimits: {
      maxContextTokens: 1000000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    name: 'Google Gemini 2.5 Flash',
    pricing: {
      inputCostPerThousand: 0.000075,
      outputCostPerThousand: 0.0003,
      cachedInputCostPerThousand: 0.00001875,
      inputPricePerMillionTokens: 0.075,
      outputPricePerMillionTokens: 0.3,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'fast',
    contextLimits: {
      maxContextTokens: 1000000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    name: 'Google Gemini 3.1 Pro (Complex Reasoning & Multimodal)',
    pricing: {
      inputCostPerThousand: 0.00125,
      outputCostPerThousand: 0.005,
      cachedInputCostPerThousand: 0.0003125,
      inputPricePerMillionTokens: 1.25,
      outputPricePerMillionTokens: 5.0,
    },
    capabilities: ['chat', 'code', 'reasoning', 'vision', 'tools', 'json'],
    qualityTier: 'flagship',
    contextLimits: {
      maxContextTokens: 2000000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    name: 'DeepSeek Chat (V3 Flagship MoE)',
    pricing: {
      inputCostPerThousand: 0.00014,
      outputCostPerThousand: 0.00028,
      cachedInputCostPerThousand: 0.000014,
      inputPricePerMillionTokens: 0.14,
      outputPricePerMillionTokens: 0.28,
    },
    capabilities: ['chat', 'code', 'tools', 'json', 'reasoning'],
    qualityTier: 'economy',
    contextLimits: {
      maxContextTokens: 64000,
      maxOutputTokens: 8192,
    },
  },
  {
    provider: 'mock',
    model: 'mock-model',
    name: 'Toka Mock Test Model',
    pricing: {
      inputCostPerThousand: 0.0001,
      outputCostPerThousand: 0.0002,
      inputPricePerMillionTokens: 0.1,
      outputPricePerMillionTokens: 0.2,
    },
    capabilities: ['chat', 'code', 'tools', 'json', 'reasoning'],
    qualityTier: 'economy',
    contextLimits: {
      maxContextTokens: 32000,
      maxOutputTokens: 4096,
    },
  },
  {
    provider: 'mock',
    model: 'demo',
    name: 'Toka Demo Model',
    pricing: {
      inputCostPerThousand: 0.0001,
      outputCostPerThousand: 0.0002,
      inputPricePerMillionTokens: 0.1,
      outputPricePerMillionTokens: 0.2,
    },
    capabilities: ['chat', 'code', 'tools', 'json'],
    qualityTier: 'economy',
    contextLimits: {
      maxContextTokens: 32000,
      maxOutputTokens: 4096,
    },
  },
];

export class ModelRegistry {
  private readonly models = new Map<string, ModelMetadata>();

  constructor(initialModels: readonly ModelMetadata[] = BUILTIN_MODELS) {
    for (const m of initialModels) {
      this.register(m);
    }
  }

  register(metadata: ModelMetadata): void {
    const key = this.getKey(metadata.model, metadata.provider);
    this.models.set(key, metadata);
    // Also index by plain model name if unique
    if (!this.models.has(metadata.model.toLowerCase())) {
      this.models.set(metadata.model.toLowerCase(), metadata);
    }
  }

  get(model: string, provider?: string): ModelMetadata | undefined {
    if (provider) {
      const match = this.models.get(this.getKey(model, provider));
      if (match) return match;
    }
    return this.models.get(model.toLowerCase());
  }

  has(model: string, provider?: string): boolean {
    return this.get(model, provider) !== undefined;
  }

  list(provider?: string): ModelMetadata[] {
    const seen = new Set<string>();
    const result: ModelMetadata[] = [];
    for (const meta of this.models.values()) {
      const uniqueKey = `${meta.provider}:${meta.model}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      if (!provider || meta.provider.toLowerCase() === provider.toLowerCase()) {
        result.push(meta);
      }
    }
    return result;
  }

  findByCapability(capability: ModelCapability): ModelMetadata[] {
    return this.list().filter((m) => m.capabilities.includes(capability));
  }

  findByTier(tier: QualityTier): ModelMetadata[] {
    return this.list().filter((m) => m.qualityTier === tier);
  }

  private getKey(model: string, provider: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }
}

export const defaultModelRegistry = new ModelRegistry();
