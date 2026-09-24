import {
  Toka,
  MockProvider,
  MemoryCache,
  CostReporter,
  TokaOpenTelemetryIntegration,
  UsageEvent,
} from '../src';

describe('Phase 7: Observability & Cost Intelligence', () => {
  it('emits standardized UsageEvents on LLM completion', async () => {
    let capturedEvent: UsageEvent | undefined;

    const toka = new Toka(
      { models: ['demo'], maxCostPerRequest: 1.0 },
      undefined,
      new MockProvider()
    );

    toka.on('usage', (event) => {
      capturedEvent = event;
    });

    const res = await toka.complete({
      model: 'demo',
      messages: [{ role: 'user', content: 'Testing observability emission' }],
      agentContext: {
        agentId: 'ci-runner',
        taskId: 'build-456',
        stage: 'testing',
        repository: 'acme/core',
      },
    });

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent?.id).toMatch(/^toka_use_/);
    expect(capturedEvent?.provider).toBe('mock');
    expect(capturedEvent?.requestedModel).toBe('demo');
    expect(capturedEvent?.actualModel).toBe('demo');
    expect(capturedEvent?.tokens.total).toBe(res.totalTokens);
    expect(capturedEvent?.cost.totalCost).toBe(res.cost);
    expect(capturedEvent?.cost.currency).toBe('USD');
    expect(capturedEvent?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(capturedEvent?.cacheHit).toBe(false);
    expect(capturedEvent?.success).toBe(true);
    expect(capturedEvent?.agentContext?.agentId).toBe('ci-runner');
    expect(capturedEvent?.agentContext?.taskId).toBe('build-456');
    expect(capturedEvent?.agentContext?.stage).toBe('testing');
    expect(capturedEvent?.agentContext?.repository).toBe('acme/core');

    // Also attached to the response
    expect(res.usageEvent).toBeDefined();
  });

  it('generates cost intelligence reports with key metrics', () => {
    const events: UsageEvent[] = [
      {
        id: '1',
        timestamp: '2026-09-24T10:00:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        requestedModel: 'gpt-4o',
        actualModel: 'gpt-4o',
        tokens: { input: 100, output: 200, total: 300 },
        cost: { inputCost: 0.02, outputCost: 0.04, totalCost: 0.06, currency: 'USD' },
        costSource: 'actual',
        latencyMs: 150,
        cacheHit: false,
        fallbackOccurred: false,
        success: true,
        agentContext: { agentId: 'agent-1', taskId: 'task-1', stage: 'generation', taskSuccess: true },
      },
      {
        id: '2',
        timestamp: '2026-09-24T10:05:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        requestedModel: 'gpt-4o',
        actualModel: 'gpt-4o-mini',
        tokens: { input: 100, output: 200, total: 300 },
        cost: { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, currency: 'USD' },
        costSource: 'actual',
        latencyMs: 50,
        cacheHit: true,
        fallbackOccurred: false,
        success: true,
        agentContext: { agentId: 'agent-1', taskId: 'task-1', stage: 'generation', taskSuccess: true },
      },
      {
        id: '3',
        timestamp: '2026-09-24T10:10:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        requestedModel: 'gpt-4o',
        actualModel: 'gpt-4o',
        tokens: { input: 50, output: 50, total: 100 },
        cost: { inputCost: 0.01, outputCost: 0.01, totalCost: 0.02, currency: 'USD' },
        costSource: 'actual',
        latencyMs: 200,
        cacheHit: false,
        fallbackOccurred: true,
        success: true,
        agentContext: { agentId: 'agent-2', taskId: 'task-2', stage: 'review' },
      },
    ];

    const report = CostReporter.generateReport(events);

    expect(report.summary.totalRequests).toBe(3);
    expect(report.summary.totalCost).toBeCloseTo(0.083, 3);
    expect(report.summary.averageCostPerRequest).toBeCloseTo(0.027667, 4);
    expect(report.summary.cacheHitRate).toBeCloseTo(0.3333, 2);
    expect(report.summary.fallbackRate).toBeCloseTo(0.3333, 2);
    expect(report.byAgent['agent-1']).toBeCloseTo(0.063, 3);
    expect(report.byAgent['agent-2']).toBeCloseTo(0.02, 2);
    expect(report.byTask['task-1']).toBeCloseTo(0.063, 3);

    // Export formats
    const jsonStr = CostReporter.exportJson(events);
    expect(JSON.parse(jsonStr).summary.totalRequests).toBe(3);

    const csvStr = CostReporter.exportCsv(events);
    expect(csvStr).toContain('agent_id,task_id,stage');
    expect(csvStr).toContain('agent-1,task-1,generation');

    const table = CostReporter.formatTerminalTable(report);
    expect(table).toContain('TOKA COST REPORT');
    expect(table).toContain('Total Cost');
  });

  it('maps events to OpenTelemetry GenAI semantic conventions', () => {
    const event: UsageEvent = {
      id: 'otel-1',
      timestamp: '2026-09-24T10:00:00.000Z',
      provider: 'openai',
      model: 'gpt-4o',
      requestedModel: 'gpt-4o',
      actualModel: 'gpt-4o-mini',
      routingDecision: {
        requestedModel: 'gpt-4o',
        actualModel: 'gpt-4o-mini',
        policy: 'cheapest',
        reason: 'Cheaper alternative',
        estimatedCost: 0.001,
        estimatedSavings: 0.015,
        changed: true,
      },
      tokens: { input: 500, output: 250, total: 750, cachedInput: 100 },
      cost: { inputCost: 0.0005, outputCost: 0.001, totalCost: 0.0015, estimatedSavings: 0.015, currency: 'USD' },
      costSource: 'actual',
      latencyMs: 120,
      cacheHit: false,
      fallbackOccurred: false,
      success: true,
      agentContext: {
        agentId: 'autocoder',
        sessionId: 'sess-888',
        taskId: 'feature-oauth',
        stage: 'generation',
        repository: 'org/frontend',
        commitSha: 'deadbeef1234',
      },
    };

    const attrs = TokaOpenTelemetryIntegration.toAttributes(event);

    expect(attrs['gen_ai.system']).toBe('openai');
    expect(attrs['gen_ai.request.model']).toBe('gpt-4o');
    expect(attrs['gen_ai.response.model']).toBe('gpt-4o-mini');
    expect(attrs['gen_ai.usage.input_tokens']).toBe(500);
    expect(attrs['gen_ai.usage.output_tokens']).toBe(250);
    expect(attrs['gen_ai.usage.total_tokens']).toBe(750);
    expect(attrs['gen_ai.usage.cached_tokens']).toBe(100);
    expect(attrs['toka.cost.usd']).toBe(0.0015);
    expect(attrs['toka.routing.policy']).toBe('cheapest');
    expect(attrs['toka.routing.savings_usd']).toBe(0.015);
    expect(attrs['toka.agent.id']).toBe('autocoder');
    expect(attrs['toka.agent.session_id']).toBe('sess-888');
    expect(attrs['toka.agent.task_id']).toBe('feature-oauth');
    expect(attrs['toka.agent.stage']).toBe('generation');
    expect(attrs['toka.repository']).toBe('org/frontend');
    expect(attrs['toka.commit_sha']).toBe('deadbeef1234');
  });

  it('records spans with tracer when tracer is provided', () => {
    let spanStarted = false;
    let spanEnded = false;
    let recordedAttrs: Record<string, unknown> = {};

    const mockTracer = {
      startSpan(name: string) {
        spanStarted = true;
        expect(name).toBe('toka.llm.gpt-4o');
        return {
          setAttribute(k: string, v: string | number | boolean) { return this; },
          setAttributes(attrs: Record<string, string | number | boolean>) {
            recordedAttrs = attrs;
            return this;
          },
          end() {
            spanEnded = true;
          },
        };
      },
    };

    const otel = new TokaOpenTelemetryIntegration(mockTracer);
    otel.recordEvent({
      id: 'ev-1',
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model: 'gpt-4o',
      requestedModel: 'gpt-4o',
      actualModel: 'gpt-4o',
      tokens: { input: 10, output: 20, total: 30 },
      cost: { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, currency: 'USD' },
      costSource: 'actual',
      latencyMs: 50,
      cacheHit: false,
      fallbackOccurred: false,
      success: true,
    });

    expect(spanStarted).toBe(true);
    expect(spanEnded).toBe(true);
    expect(recordedAttrs['toka.cost.usd']).toBe(0.003);
  });
});
