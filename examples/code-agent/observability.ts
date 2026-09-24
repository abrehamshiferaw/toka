import { Toka, MockProvider, TokaOpenTelemetryIntegration } from '../../src';

async function main() {
  console.log('--- Toka: Observability & Cost Intelligence Example ---');

  // Optional mock OpenTelemetry tracer to demonstrate telemetry integration
  const mockTracer = {
    startSpan(name: string) {
      return {
        setAttribute(k: string, v: string | number | boolean) { return this; },
        setAttributes(attrs: Record<string, string | number | boolean>) {
          console.log(`[OTel Span '${name}'] Recorded GenAI Semantic Attributes:`, Object.keys(attrs).join(', '));
          return this;
        },
        end() {},
      };
    },
  };

  const toka = new Toka(
    {
      models: ['gpt-4o', 'gpt-4o-mini'],
      maxCostPerRequest: 1.0,
    },
    undefined,
    new MockProvider(),
    undefined,
    undefined,
    {
      tracer: mockTracer,
    }
  );

  // Subscribe to standardized usage events
  toka.on('usage', (event) => {
    console.log(`[EVENT: Usage] Model: ${event.actualModel} | Tokens: ${event.tokens.total} | Cost: $${event.cost.totalCost.toFixed(6)}`);
  });

  // Execute multi-agent simulated tasks
  const tasks = ['task-lint', 'task-build', 'task-deploy'];
  for (const taskId of tasks) {
    await toka.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Execute step for ${taskId}` }],
      agentContext: {
        agentId: 'ci-agent',
        taskId,
        stage: 'testing',
        taskSuccess: true,
      },
    });
  }

  console.log('\n--- Generated Terminal Cost Report ---');
  console.log(toka.formatReportTable());

  console.log('\n--- JSON Export (first 200 chars) ---');
  console.log(toka.exportJson().substring(0, 200) + '...\n');

  console.log('--- CSV Export Header & Row 1 ---');
  const csvLines = toka.exportCsv().split('\n');
  console.log(csvLines[0]);
  console.log(csvLines[1]);
}

if (require.main === module) {
  main().catch(console.error);
}
