export { Toka } from './core/toka';
export type { TokaOptions } from './core/toka';

export { MockProvider, createMockProvider } from './providers/mock';
export { OpenAIProvider } from './providers/openai';
export type { OpenAIProviderOptions } from './providers/openai';

export { MemoryCache } from './cache/memoryCache';
export { RedisCache, createRedisCache } from './cache/redisCache';
export type { RedisCacheOptions } from './cache/redisCache';
export type {
  CacheAdapter,
  CacheMetrics,
  CacheOptions,
  RedisClientLike,
} from './cache/types';

export {
  loadConfig,
  validateConfig,
  validateBudgetPolicy,
  validateScopeLimit,
  createSampleConfig,
} from './config';

export { createCacheKey, canonicalize } from './security/cache-key';
export type { CacheKeyOptions } from './security/cache-key';
export {
  isSensitiveRequest,
  containsSensitiveData,
} from './security/sensitive';

export {
  calculateCost,
  getPricing,
  defaultPricingRegistry,
} from './cost/pricing';
export type {
  ModelPricing,
  PricingOverride,
  CostBreakdown,
} from './cost/pricing';

export { estimateCost } from './cost/estimator';
export {
  getNextModel,
  getModelWithinBudget,
  ModelFallbackHandler,
} from './fallback/modelFallback';

export {
  TokaError,
  TokaConfigurationError,
  TokaProviderError,
  TokaAuthenticationError,
  TokaInvalidRequestError,
  TokaInvalidModelError,
  TokaRateLimitError,
  TokaTimeoutError,
  TokaNetworkError,
  TokaProviderServerError,
  TokaBudgetExceededError,
  TokaCacheError,
  TokaCacheUnavailableError,
  TokaPricingError,
} from './errors';
export type { TokaErrorOptions, TokaBudgetErrorOptions } from './errors';

export { BudgetManager } from './budgets/manager';
export {
  InMemoryBudgetStore,
  roundCost,
} from './budgets/store';
export type {
  BudgetStore,
  ReservationItem,
  ReservationResult,
} from './budgets/store';

export {
  ModelRouter,
  ModelRegistry,
  defaultModelRegistry,
  BUILTIN_MODELS,
} from './routing';
export type {
  QualityTier,
  ModelCapability,
  ModelPricingDetails,
  ContextLimits,
  ModelMetadata,
  RoutingPolicy,
  RoutingRequirements,
  RoutingDecision,
  RoutingConfig,
  RouteOptions,
} from './routing';

export { AgentAnalytics } from './agent';
export type {
  AgentStage,
  AgentContext,
  AgentCostSummary,
  DimensionCostSummary,
} from './agent';

export {
  TokaEventEmitter,
  TokaLogger,
  CostReporter,
  TokaOpenTelemetryIntegration,
} from './observability';
export type {
  UsageEvent,
  ReportFilter,
  CostReportSummary,
  CostReport,
  LogLevel,
  LogFormat,
  LoggerOptions,
  TokaEventMap,
  OpenTelemetrySpanLike,
  OpenTelemetryTracerLike,
} from './observability';

export type {
  BudgetAction,
  BudgetContext,
  BudgetDecision,
  BudgetLimitConfig,
  BudgetLimitStatus,
  BudgetPolicy,
  BudgetScope,
  BudgetStatus,
  BudgetViolation,
  BudgetWarning,
  ScopeLimit,
  AIProvider,
  Cache,
  Message,
  MessageRole,
  ToolDefinition,
  RequestMetadata,
  SDKConfig,
  SDKRequest,
  SDKResponse,
  ProviderRequest,
  ProviderResponse,
  ProviderUsage,
  LegacyRequestOptions,
  LegacySDKResponse,
  RetryConfig,
} from './types';

import { Toka } from './core/toka';
import { createSampleConfig } from './config';

export function createTokaWithSampleConfig(): Toka {
  return new Toka(createSampleConfig());
}
