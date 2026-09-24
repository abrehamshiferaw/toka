import { estimateCost } from '../cost/estimator';
import { calculateCost, getPricing } from '../cost/pricing';
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
  getMessageText,
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
    this.validateRequest(request);
    const key = createCacheKey(request);
    if (this.cache) {
      const cached = await this.cache.get<SDKResponse>(key);
      if (cached) return { ...cached, cacheHit: true };
    }

    const pricing =
      this.provider.name === 'mock'
        ? undefined
        : getPricing(this.provider.name, request.model, this.config.pricing);
    const started = Date.now();
    let result;
    try {
      result = await this.provider.complete(request);
    } catch (cause) {
      if (cause instanceof TokaError) throw cause;
      throw new TokaProviderError('Provider completion failed.', {
        cause,
        provider: this.provider.name,
        model: request.model,
      });
    }

    const estimatedInput = Math.max(
      1,
      Math.ceil(getMessageText(request.messages).length / 4)
    );
    const estimatedOutput = Math.max(1, Math.ceil(result.text.length / 4));
    const actualUsage = result.usage && !result.usage.isEstimated;
    const inputTokens = result.usage?.inputTokens ?? estimatedInput;
    const outputTokens = result.usage?.outputTokens ?? estimatedOutput;
    const totalTokens = result.usage?.totalTokens ?? inputTokens + outputTokens;
    let inputCost: number | undefined;
    let outputCost: number | undefined;
    let cost: number;
    let costSource: SDKResponse['costSource'];
    if (pricing) {
      const breakdown = calculateCost(
        pricing,
        inputTokens,
        outputTokens,
        actualUsage ? 'actual' : 'estimated'
      );
      ({ inputCost, outputCost, cost, costSource } = breakdown);
    } else {
      const estimate = estimateCost(
        getMessageText(request.messages),
        request.model
      );
      cost = estimate.cost;
      costSource = 'estimated';
    }
    if (cost > this.config.maxCostPerRequest)
      throw new TokaBudgetExceededError(
        `Request cost exceeds the configured maximum of $${this.config.maxCostPerRequest}.`,
        { provider: result.provider, model: result.modelUsed }
      );
    const response: SDKResponse = {
      text: result.text,
      provider: result.provider,
      modelUsed: result.modelUsed,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost,
      outputCost,
      cost,
      costSource,
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
    return { ...response, tokens: response.totalTokens };
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

  private validateRequest(request: SDKRequest): void {
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
  }
}
