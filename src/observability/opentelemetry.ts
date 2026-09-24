import { UsageEvent } from './types';

export interface OpenTelemetrySpanLike {
  setAttribute(key: string, value: string | number | boolean): this;
  setAttributes(attributes: Record<string, string | number | boolean>): this;
  recordException?(exception: Error): void;
  setStatus?(status: { code: number; message?: string }): void;
  end(): void;
}

export interface OpenTelemetryTracerLike {
  startSpan(name: string, options?: unknown): OpenTelemetrySpanLike;
}

export class TokaOpenTelemetryIntegration {
  private readonly tracer?: OpenTelemetryTracerLike;

  constructor(tracer?: OpenTelemetryTracerLike) {
    this.tracer = tracer;
  }

  static toAttributes(event: UsageEvent): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {
      'gen_ai.system': event.provider,
      'gen_ai.request.model': event.requestedModel,
      'gen_ai.response.model': event.actualModel,
      'gen_ai.usage.input_tokens': event.tokens.input,
      'gen_ai.usage.output_tokens': event.tokens.output,
      'gen_ai.usage.total_tokens': event.tokens.total,
      'toka.cost.usd': event.cost.totalCost,
      'toka.cache.hit': event.cacheHit,
      'toka.fallback': event.fallbackOccurred,
      'toka.success': event.success,
      'toka.latency_ms': event.latencyMs,
    };

    if (event.tokens.cachedInput !== undefined) {
      attrs['gen_ai.usage.cached_tokens'] = event.tokens.cachedInput;
    }
    if (event.cost.estimatedSavings !== undefined && event.cost.estimatedSavings > 0) {
      attrs['toka.routing.savings_usd'] = event.cost.estimatedSavings;
    }
    if (event.routingDecision?.policy) {
      attrs['toka.routing.policy'] = event.routingDecision.policy;
    }
    if (event.agentContext?.agentId) {
      attrs['toka.agent.id'] = event.agentContext.agentId;
    }
    if (event.agentContext?.sessionId) {
      attrs['toka.agent.session_id'] = event.agentContext.sessionId;
    }
    if (event.agentContext?.taskId) {
      attrs['toka.agent.task_id'] = event.agentContext.taskId;
    }
    if (event.agentContext?.stage) {
      attrs['toka.agent.stage'] = event.agentContext.stage;
    }
    if (event.agentContext?.repository) {
      attrs['toka.repository'] = event.agentContext.repository;
    }
    if (event.agentContext?.commitSha) {
      attrs['toka.commit_sha'] = event.agentContext.commitSha;
    }

    return attrs;
  }

  recordEvent(event: UsageEvent): void {
    if (!this.tracer) return;

    const span = this.tracer.startSpan(`toka.llm.${event.actualModel}`);
    span.setAttributes(TokaOpenTelemetryIntegration.toAttributes(event));

    if (!event.success && event.error) {
      if (span.recordException) {
        span.recordException(new Error(`[${event.error.code}] ${event.error.message}`));
      }
      if (span.setStatus) {
        span.setStatus({ code: 2, message: event.error.message }); // 2 = ERROR in OTel
      }
    }

    span.end();
  }
}
