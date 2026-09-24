import { estimateCost } from '../cost/estimator';
import { calculateCost, getPricing, ModelPricing } from '../cost/pricing';
import {
  TokaBudgetExceededError,
  TokaConfigurationError,
  TokaError,
  TokaProviderError,
} from '../errors';
import { createCacheKey } from '../security/cache-key';
import { isSensitiveRequest } from '../security/sensitive';
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
import { ModelRouter } from '../routing/router';
import { defaultModelRegistry } from '../routing/registry';
import { RoutingDecision, RoutingPolicy } from '../routing/types';
import { AgentAnalytics } from '../agent/analytics';
import { AgentCostSummary, AgentStage } from '../agent/types';
import { TokaEventEmitter, TokaEventMap } from '../observability/events';
import { TokaLogger, LoggerOptions, LogLevel } from '../observability/logger';
import { CostReporter } from '../observability/reporter';
import { CostReport, ReportFilter, UsageEvent } from '../observability/types';
import { TokaOpenTelemetryIntegration, OpenTelemetryTracerLike } from '../observability/opentelemetry';
import { CacheAdapter } from '../cache/types';

let nextEventId = 1;

export interface TokaOptions {
  cache?: Cache;
  provider?: AIProvider;
  budgetStore?: BudgetStore;
  clock?: () => Date;
  router?: ModelRouter;
  analytics?: AgentAnalytics;
  logger?: LoggerOptions;
  tracer?: OpenTelemetryTracerLike;
}

export class Toka {
  private config: SDKConfig;
  private readonly cache?: Cache;
  private readonly provider: AIProvider;
  private readonly budgetManager: BudgetManager;
  private readonly router: ModelRouter;
  private readonly analytics: AgentAnalytics;
  private readonly events: TokaEventEmitter;
  private readonly logger: TokaLogger;
  private readonly otel: TokaOpenTelemetryIntegration;

  constructor(
    config: SDKConfig,
    cache?: Cache,
    provider: AIProvider = createMockProvider(),
    budgetStore?: BudgetStore,
    clock?: () => Date,
    options: Partial<TokaOptions> = {}
  ) {
    this.config = validateConfig(config);
    this.cache = cache ?? options.cache;
    this.provider = provider ?? options.provider ?? createMockProvider();
    this.budgetManager = new BudgetManager(
      this.config.budgets ?? {
        perRequest: this.config.maxCostPerRequest,
        defaultAction: 'block',
      },
      budgetStore ?? options.budgetStore ?? new InMemoryBudgetStore(),
      clock ?? options.clock
    );

    // Register custom model metadata if configured
    if (this.config.modelsMetadata) {
      for (const meta of this.config.modelsMetadata) {
        defaultModelRegistry.register(meta);
      }
    }

    const defaultRoutingPolicy: RoutingPolicy =
      typeof this.config.routing === 'string'
        ? this.config.routing
        : this.config.routing?.policy ?? 'strict-model';

    this.router = options.router ?? new ModelRouter(defaultModelRegistry, defaultRoutingPolicy);
    this.analytics = options.analytics ?? new AgentAnalytics();
    this.events = new TokaEventEmitter();
    const defaultLogLevel: LogLevel = options.logger?.level ?? ((process.env.NODE_ENV === 'test' || !process.env.TOKA_LOG) ? 'silent' : 'info');
    this.logger = new TokaLogger({ level: defaultLogLevel, ...options.logger });
    this.otel = new TokaOpenTelemetryIntegration(options.tracer);
  }

  getBudgetManager(): BudgetManager {
    return this.budgetManager;
  }

  getRouter(): ModelRouter {
    return this.router;
  }

  getAnalytics(): AgentAnalytics {
    return this.analytics;
  }

  getCache(): Cache | undefined {
    return this.cache;
  }

  getEvents(): readonly UsageEvent[] {
    return this.events.getEvents();
  }

  // Event emitter proxy methods
  on<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.events.on(event, listener);
    return this;
  }

  once<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.events.once(event, listener);
    return this;
  }

  off<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.events.off(event, listener);
    return this;
  }

  // Cost intelligence / Agent methods
  getCostByAgent(agentId?: string): Record<string, number> | number {
    return agentId ? this.analytics.getCostByAgent(agentId) : this.analytics.getCostByAgent();
  }

  getCostByRepository(repository?: string): Record<string, number> | number {
    return repository ? this.analytics.getCostByRepository(repository) : this.analytics.getCostByRepository();
  }

  getCostByTask(taskId?: string): Record<string, number> | number {
    return taskId ? this.analytics.getCostByTask(taskId) : this.analytics.getCostByTask();
  }

  getCostByStage(stage?: AgentStage): Record<string, number> | number {
    return stage ? this.analytics.getCostByStage(stage) : this.analytics.getCostByStage();
  }

  getCostByModel(model?: string): Record<string, number> | number {
    return model ? this.analytics.getCostByModel(model) : this.analytics.getCostByModel();
  }

  getTopSpenders() {
    return this.analytics.getTopSpenders();
  }

  getAgentSummary(): AgentCostSummary {
    return this.analytics.getSummary();
  }

  getCostPerSuccessfulTask(): number | undefined {
    return this.analytics.getSummary().costPerSuccessfulTask;
  }

  markTaskSuccess(taskId: string): void {
    this.analytics.markTaskSuccess(taskId);
  }

  generateReport(filter?: ReportFilter): CostReport {
    return CostReporter.generateReport(this.events.getEvents(), filter);
  }

  exportJson(filter?: ReportFilter): string {
    return CostReporter.exportJson(this.events.getEvents(), filter);
  }

  exportCsv(filter?: ReportFilter): string {
    return CostReporter.exportCsv(this.events.getEvents(), filter);
  }

  formatReportTable(filter?: ReportFilter): string {
    const report = this.generateReport(filter);
    return CostReporter.formatTerminalTable(report);
  }

  async invalidateCache(namespaceOrPattern?: string): Promise<number> {
    if (!this.cache) return 0;
    const adapter = this.cache as unknown as CacheAdapter;
    if (namespaceOrPattern) {
      if (adapter.invalidatePattern) {
        return await adapter.invalidatePattern(namespaceOrPattern);
      }
      if (adapter.invalidateNamespace) {
        return await adapter.invalidateNamespace(namespaceOrPattern);
      }
    }
    await this.cache.clear();
    return 1;
  }

  private resolvePricing(model: string): ModelPricing | null {
    if (this.provider.name === 'mock') {
      try {
        return getPricing(this.provider.name, model, this.config.pricing);
      } catch {
        return null;
      }
    }
    return getPricing(this.provider.name, model, this.config.pricing);
  }

  async evaluateBudget(request: SDKRequest): Promise<BudgetDecision> { return this.checkBudget(request); }

  async checkBudget(request: SDKRequest): Promise<BudgetDecision> {
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
    const started = Date.now();
    const eventId = `toka_use_${Date.now()}_${nextEventId++}`;

    // 1. Smart Model Routing
    let routingPolicy: RoutingPolicy = 'strict-model';
    if (typeof request.routing === 'string') {
      routingPolicy = request.routing;
    } else if (typeof request.routing === 'object' && request.routing.policy) {
      routingPolicy = request.routing.policy;
    } else if (typeof this.config.routing === 'string') {
      routingPolicy = this.config.routing;
    } else if (typeof this.config.routing === 'object' && this.config.routing.policy) {
      routingPolicy = this.config.routing.policy;
    }

    const routingDecision: RoutingDecision = this.router.route(request, {
      policy: routingPolicy,
      allowedModels: this.config.models,
      provider: this.provider.name,
    });

    if (routingDecision.changed) {
      this.events.emit('routing', routingDecision);
    }

    // Effective model to use for completion
    const effectiveModel = routingDecision.actualModel;
    const effectiveRequest: SDKRequest = {
      ...request,
      model: effectiveModel,
    };

    // Synchronize agentContext into budgetContext if missing
    if (request.agentContext && !effectiveRequest.budgetContext) {
      effectiveRequest.budgetContext = {
        taskId: request.agentContext.taskId,
        sessionId: request.agentContext.sessionId,
      };
    }

    // 2. Sensitive data protection & Caching
    const sensitive = isSensitiveRequest(request);
    const cacheOptIn = request.cache !== false;
    const cachingAllowed = !sensitive && cacheOptIn && Boolean(this.cache);

    const cacheKey = createCacheKey(effectiveRequest);

    if (cachingAllowed && this.cache) {
      const cached = await this.cache.get<SDKResponse>(cacheKey);
      if (cached) {
        const latencyMs = Date.now() - started;
        const cachedResponse: SDKResponse = {
          ...cached,
          cacheHit: true,
          latencyMs,
          routingDecision,
          agentContext: request.agentContext,
        };

        const memCache = this.cache as unknown as { recordHit?: (cost: number, tokens: number) => void };
        if (typeof memCache.recordHit === 'function') {
          memCache.recordHit(cached.cost, cached.totalTokens);
        }

        this.events.emit('cacheHit', {
          key: cacheKey,
          savedCost: cached.cost,
          savedTokens: cached.totalTokens,
        });

        // Record usage event for cache hit
        const usageEv: UsageEvent = {
          id: eventId,
          timestamp: new Date().toISOString(),
          provider: this.provider.name,
          model: request.model,
          requestedModel: request.model,
          actualModel: effectiveModel,
          routingDecision,
          tokens: {
            input: cached.inputTokens,
            output: cached.outputTokens,
            total: cached.totalTokens,
          },
          cost: {
            inputCost: 0,
            outputCost: 0,
            totalCost: 0,
            estimatedSavings: cached.cost,
            currency: 'USD',
          },
          costSource: cached.costSource,
          latencyMs,
          cacheHit: true,
          fallbackOccurred: false,
          success: true,
          agentContext: request.agentContext,
        };

        this.analytics.record({
          agentContext: request.agentContext,
          model: effectiveModel,
          cost: 0,
          tokens: cached.totalTokens,
          success: true,
          cacheHit: true,
        });

        this.events.emit('usage', usageEv);
        this.logger.logUsage(usageEv);
        this.otel.recordEvent(usageEv);

        cachedResponse.usageEvent = usageEv;
        return cachedResponse;
      }
    }

    // 3. Pre-request cost estimation
    const pricing = this.resolvePricing(effectiveModel);
    const estimatedCost = this.estimateRequestCost(effectiveRequest);

    // 4. Pre-request budget evaluation and reservation (atomic)
    const { decision, reservationId } =
      await this.budgetManager.evaluateAndReserve(
        effectiveRequest,
        estimatedCost,
        this.config.models
      );

    if (decision.action === 'approval_required') {
      const err = new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: effectiveModel,
        action: 'approval_required',
        requestedCost: decision.estimatedCost,
        decision,
      });
      this.events.emit('budgetExceeded', err);
      throw err;
    }

    if (decision.action === 'fallback') {
      const primaryViolation = decision.violations[0];
      const err = new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: effectiveModel,
        scope: primaryViolation?.scope,
        limit: primaryViolation?.limit,
        spent: primaryViolation?.spent,
        remaining: primaryViolation?.remaining,
        requestedCost: decision.estimatedCost,
        action: 'fallback',
        decision,
      });
      this.events.emit('budgetExceeded', err);
      throw err;
    }

    if (
      decision.action === 'block' ||
      (!decision.allowed && decision.action !== 'warn')
    ) {
      const primaryViolation = decision.violations[0];
      const err = new TokaBudgetExceededError(decision.reason, {
        provider: this.provider.name,
        model: effectiveModel,
        scope: primaryViolation?.scope,
        limit: primaryViolation?.limit,
        spent: primaryViolation?.spent,
        remaining: primaryViolation?.remaining,
        requestedCost: decision.estimatedCost,
        action: 'block',
        decision,
      });
      this.events.emit('budgetExceeded', err);
      throw err;
    }

    // 5. Provider completion execution
    let result;
    try {
      result = await this.provider.complete(effectiveRequest);
    } catch (cause) {
      if (reservationId) {
        await this.budgetManager.release(reservationId);
      }

      // Record failed event for observability
      const failedEv: UsageEvent = {
        id: eventId,
        timestamp: new Date().toISOString(),
        provider: this.provider.name,
        model: request.model,
        requestedModel: request.model,
        actualModel: effectiveModel,
        routingDecision,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
        costSource: 'estimated',
        latencyMs: Date.now() - started,
        cacheHit: false,
        fallbackOccurred: false,
        success: false,
        error: {
          code: cause instanceof TokaError ? cause.code : 'PROVIDER_ERROR',
          message: cause instanceof Error ? cause.message : String(cause),
        },
        agentContext: request.agentContext,
      };
      this.events.emit('usage', failedEv);
      this.otel.recordEvent(failedEv);

      if (cause instanceof TokaError) throw cause;
      throw new TokaProviderError('Provider completion failed.', {
        cause,
        provider: this.provider.name,
        model: effectiveModel,
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
      const estimate = estimateCost(promptText, effectiveModel);
      cost = estimate.cost;
      costSource = 'estimated';
    }

    // Commit actual cost to budget counters
    await this.budgetManager.commit(reservationId, cost, effectiveRequest.budgetContext);

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
      this.events.emit('budgetWarning', budgetWarning);
    }

    const latencyMs = Date.now() - started;

    // 6. Record analytics & events
    this.analytics.record({
      agentContext: request.agentContext,
      model: effectiveModel,
      cost,
      tokens: totalTokens,
      success: true,
      cacheHit: false,
    });

    const usageEv: UsageEvent = {
      id: eventId,
      timestamp: new Date().toISOString(),
      provider: result.provider,
      model: request.model,
      requestedModel: request.model,
      actualModel: result.modelUsed,
      routingDecision,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      cost: {
        inputCost: inputCost ?? 0,
        outputCost: outputCost ?? 0,
        totalCost: cost,
        estimatedSavings: routingDecision.estimatedSavings,
        currency: 'USD',
      },
      costSource: actualUsage ? 'actual' : 'estimated',
      latencyMs,
      cacheHit: false,
      fallbackOccurred: false,
      success: true,
      agentContext: request.agentContext,
    };

    this.events.emit('usage', usageEv);
    this.logger.logUsage(usageEv);
    this.otel.recordEvent(usageEv);

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
      latencyMs,
      budgetDecision: decision,
      budgetWarning,
      routingDecision,
      agentContext: request.agentContext,
      usageEvent: usageEv,
    };

    if (cachingAllowed && this.cache) {
      await this.cache.set(cacheKey, response, this.config.cacheTTL);
    }

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
