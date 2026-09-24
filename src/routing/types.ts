export type QualityTier = 'flagship' | 'standard' | 'fast' | 'economy';

export type ModelCapability =
  | 'chat'
  | 'code'
  | 'reasoning'
  | 'vision'
  | 'tools'
  | 'json'
  | 'embedding'
  | string;

export interface ModelPricingDetails {
  /** Input cost in USD per 1,000 tokens */
  inputCostPerThousand: number;
  /** Output cost in USD per 1,000 tokens */
  outputCostPerThousand: number;
  /** Cached input cost in USD per 1,000 tokens (if supported) */
  cachedInputCostPerThousand?: number;
  /** Input price in USD per 1,000,000 tokens (compatibility) */
  inputPricePerMillionTokens?: number;
  /** Output price in USD per 1,000,000 tokens (compatibility) */
  outputPricePerMillionTokens?: number;
}

export interface ContextLimits {
  /** Maximum context length (input + output) in tokens */
  maxContextTokens: number;
  /** Maximum output tokens supported in a single request */
  maxOutputTokens: number;
}

export interface ModelMetadata {
  provider: string;
  model: string;
  name?: string;
  pricing: ModelPricingDetails;
  capabilities: ModelCapability[];
  qualityTier: QualityTier;
  contextLimits: ContextLimits;
}

export type RoutingPolicy =
  | 'cheapest'
  | 'balanced'
  | 'quality-first'
  | 'strict-model';

export interface RoutingRequirements {
  capabilities?: ModelCapability[];
  minContextTokens?: number;
  maxEstimatedCost?: number;
  preferredTier?: QualityTier;
}

export interface RoutingDecision {
  requestedModel: string;
  actualModel: string;
  policy: RoutingPolicy;
  reason: string;
  estimatedCost: number;
  estimatedSavings: number;
  changed: boolean;
  modelMetadata?: ModelMetadata;
  evaluatedModels?: string[];
}

export interface RoutingConfig {
  policy?: RoutingPolicy;
  fallbackOnExceed?: boolean;
  allowedModels?: string[];
  requirements?: RoutingRequirements;
  customMetadata?: ModelMetadata[];
}
