import { estimateCost } from '../cost/estimator';
import { calculateCost, getPricing, ModelPricing } from '../cost/pricing';
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
  BudgetContext,
  BudgetDecision,
  BudgetStatus,
  BudgetScope,
  BudgetWarning,
} from '../types';
import { validateConfig } from '../config';
import { BudgetManager } from '../budgets/manager';
import { BudgetStore, InMemoryBudgetStore } from '../budgets/store';

export class Toka {
  private config: SDKConfig;
  private readonly cache?: Cache;
  private readonly provider: AIProvider;
  private readonly budgetManager: BudgetManager;

  constructor(
    config: SDKConfig,
    cache?: Cache,
    provider: AIProvider = createMockProvider(),
    budgetStore?: BudgetStore,
    clock?: () => Date
  ) {
    this.config = validateConfig(config);
    this.cache = cache;
    this.provider = provider;
    this.budgetManager = new BudgetManager(
      this.config.budgets ?? {
        perRequest: this.config.maxCostPerRequest,
        defaultAction: 'block',
      },
      budgetStore ?? new InMemoryBudgetStore(),
      clock
    );
  }

  getBudgetManager(): BudgetManager {
    return this.budgetManager;
  }

  getBudgetStore(): BudgetStore {
    return this.budgetManager.getStore();
  }

  private resolvePricing(model: string): ModelPricing | undefined {
    if (this.provider.name === 'mock') {
      const key = `mock:${model}`;
      const override = this.config.pricing?.[key];
      if (override)
        return { provider: 'mock', model, currency: 'USD', ...override };
      return undefined;
    }
    return getPricing(this.provider.name, model, this.config.pricing);
  }

  async evaluateBudget(request: SDKRequest): Promise<BudgetDecision> {
    this.validateRequest(request);
    const estimatedCost = this.estimateRequestCost(request);
    return this.budgetManager.evaluate(
      request,
      estimatedCost,
      this.config.models
    );
  }

  async getBudgetStatus(context?: BudgetContext): Promise<BudgetStatus> {
    return this.budgetManager.getStatus(context);
  }

  async resetBudget(scope?: BudgetScope, key?: string): Promise<void> {
    await this.budgetManager.reset(scope, key);
  }

  private estimateRequestCost(request: SDKRequest): number {
    const pricing = this.resolvePricing(request.model);

    const promptText = getMessageText(request.messages);
    if (promptText.length === 0 && (request.maxTokens ?? 0) === 0) {
      return 0;
    }

    const estimatedInput =
      promptText.length > 0 ? Math.max(1, Math.ceil(promptText.length / 4)) : 0;

    if (pricing) {
      const estimatedOutput =
        request.maxTokens ?? Math.max(1, Math.ceil(estimatedInput / 2));
      const breakdown = calculateCost(
        pricing,
        estimatedInput,
        estimatedOutput,
        'estimated'
      );
      return breakdown.cost;
    }

    const estimate = estimateCost(promptText, request.model);
    return estimate.cost;
  }

  async complete(request: SDKRequest): Promise<SDKResponse> {
    this.validateRequest(request);
    const key = createCacheKey(request);
    if (this.cache) {
      const cached = await this.cache.get<SDKResponse>(key);
      if (cached) return { ...cached, cacheHit: true };
    }

    const pricing = this.resolvePricing(request.model);

    // Pre-request cost estimation
    const estimatedCost = this.estimateRequestCost(request);

    // Pre-request budget evaluation and reservation (atomic)
    const { decision, reservationId } =
      await this.budgetManager.evaluateAndReserve(
        request,
        estimatedCost,
        this.config.models
      );

    if (decision.action === 'approval_required') {
      throw new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: request.model,
        action: 'approval_required',
        requestedCost: decision.estimatedCost,
        decision,
      });
    }

    if (decision.action === 'fallback') {
      const primaryViolation = decision.violations[0];
      throw new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: request.model,
        scope: primaryViolation?.scope,
        limit: primaryViolation?.limit,
        spent: primaryViolation?.spent,
        remaining: primaryViolation?.remaining,
        requestedCost: decision.estimatedCost,
        action: 'fallback',
        decision,
      });
    }

    if (
      decision.action === 'block' ||
      (!decision.allowed && decision.action !== 'warn')
    ) {
      const primaryViolation = decision.violations[0];
      throw new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: request.model,
        scope: primaryViolation?.scope,
        limit: primaryViolation?.limit,
        spent: primaryViolation?.spent,
        remaining: primaryViolation?.remaining,
        requestedCost: decision.estimatedCost,
        action: 'block',
        decision,
      });
    }

    const started = Date.now();
    let result;
    try {
      result = await this.provider.complete(request);
    } catch (cause) {
      if (reservationId) {
        await this.budgetManager.release(reservationId);
      }
      if (cause instanceof TokaError) throw cause;
      throw new TokaProviderError('Provider completion failed.', {
        cause,
        provider: this.provider.name,
        model: request.model,
      });
    }

    const promptText = getMessageText(request.messages);
    const estimatedInput =
      promptText.length > 0 ? Math.max(1, Math.ceil(promptText.length / 4)) : 0;
    const estimatedOutput =
      result.text.length > 0
        ? Math.max(1, Math.ceil(result.text.length / 4))
        : 0;
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
      const estimate = estimateCost(promptText, request.model);
      cost = estimate.cost;
      costSource = 'estimated';
    }

    // Commit actual cost to budget counters
    await this.budgetManager.commit(reservationId, cost, request.budgetContext);

    // Backward-compatible check for maxCostPerRequest or hard perRequest limit
    const reqLimit = this.config.budgets?.perRequest;
    const reqAction =
      (typeof reqLimit === 'object' && reqLimit?.action) ||
      this.config.budgets?.action ||
      this.config.budgets?.defaultAction ||
      'block';

    const perRequestLimit = this.config.maxCostPerRequest;
    if (
      reqAction === 'block' &&
      perRequestLimit !== undefined &&
      cost > perRequestLimit
    ) {
      throw new TokaBudgetExceededError(
        `Request cost exceeds the configured maximum of $${perRequestLimit}.`,
        {
          provider: result.provider,
          model: result.modelUsed,
          scope: 'request',
          limit: perRequestLimit,
          spent: 0,
          remaining: 0,
          requestedCost: cost,
          action: 'block',
        }
      );
    }

    let budgetWarning: BudgetWarning | undefined;
    if (decision.action === 'warn' && decision.violations.length > 0) {
      const viol = decision.violations[0];
      budgetWarning = {
        scope: viol.scope,
        limit: viol.limit,
        spent: viol.spent,
        remaining: viol.remaining,
        message: decision.reason,
      };
    }

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
      budgetDecision: decision,
      budgetWarning,
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
    if (this.config.budgets) {
      this.budgetManager.setPolicy(this.config.budgets);
    }
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
