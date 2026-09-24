import { estimateCost } from '../cost/estimator';
import {
  TokaBudgetExceededError,
  TokaConfigurationError,
  TokaError,
  TokaProviderError,
} from '../errors';
import { createCacheKey } from '../security/cache-key';
import { createMockProvider } from '../providers/mock';
import {
  Cache,
  cloneConfig,
  LegacyRequestOptions,
  LegacySDKResponse,
  AIProvider,
  SDKConfig,
  SDKRequest,
  SDKResponse,
  normalizeLegacyOptions,
} from '../types';
import { validateConfig } from '../config';

export class Toka {
  private config: SDKConfig;
  private readonly cache?: Cache;
  private readonly provider: AIProvider;

  constructor(
    config: SDKConfig,
    cache?: Cache,
    provider: AIProvider = createMockProvider()
  ) {
    this.config = validateConfig(config);
    this.cache = cache;
    this.provider = provider;
  }

  async complete(request: SDKRequest): Promise<SDKResponse> {
    if (!request.model || request.model.trim() === '')
      throw new TokaConfigurationError('Model name must not be empty.');
    if (!this.config.models.includes(request.model))
      throw new TokaConfigurationError(
        `Model '${request.model}' is not in the allowed models list.`
      );
    if (!Array.isArray(request.messages) || request.messages.length === 0)
      throw new TokaConfigurationError('At least one message is required.');
    if (
      request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) || request.temperature < 0)
    )
      throw new TokaConfigurationError(
        'temperature must be a non-negative finite number.'
      );
    if (
      request.maxTokens !== undefined &&
      (!Number.isInteger(request.maxTokens) || request.maxTokens <= 0)
    )
      throw new TokaConfigurationError('maxTokens must be a positive integer.');

    const key = createCacheKey(request);
    if (this.cache) {
      const cached = await this.cache.get<SDKResponse>(key);
      if (cached) return { ...cached, cacheHit: true };
    }

    const estimate = estimateCost(
      request.messages.map((message) => message.content).join('\n'),
      request.model
    );
    if (estimate.cost > this.config.maxCostPerRequest)
      throw new TokaBudgetExceededError(
        `Estimated request cost exceeds the configured maximum of $${this.config.maxCostPerRequest}.`
      );
    const started = Date.now();
    let result;
    try {
      result = await this.provider.complete(request);
    } catch (cause) {
      if (cause instanceof TokaError) throw cause;
      throw new TokaProviderError('Provider completion failed.', { cause });
    }
    const usage = result.usage;
    const response: SDKResponse = {
      text: result.text,
      provider: result.provider,
      modelUsed: result.modelUsed,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      cost: estimate.cost,
      costSource: usage?.isEstimated ? 'estimated' : 'provider',
      cacheHit: false,
      latencyMs: Date.now() - started,
    };
    if (this.cache) await this.cache.set(key, response, this.config.cacheTTL);
    return response;
  }

  /** Compatibility API for 1.x callers; prefer complete(). */
  async request(
    model: string,
    prompt: string,
    options?: LegacyRequestOptions
  ): Promise<LegacySDKResponse> {
    const response = await this.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...normalizeLegacyOptions(options),
    });
    return { ...response, tokens: response.totalTokens ?? 0 };
  }

  getConfig(): SDKConfig {
    return cloneConfig(this.config);
  }
  updateConfig(newConfig: Partial<SDKConfig>): void {
    this.config = validateConfig({ ...this.config, ...newConfig });
  }
  isModelAvailable(model: string): boolean {
    return this.config.models.includes(model);
  }
}
