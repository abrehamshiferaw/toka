import { Toka, MockProvider } from '../../src';

async function main() {
  console.log('--- Toka: Basic Coding Agent Example ---');

  const toka = new Toka(
    {
      models: ['gpt-4o', 'gpt-4o-mini'],
      maxCostPerRequest: 0.1,
    },
    undefined,
    new MockProvider()
  );

  const response = await toka.complete({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an autonomous senior TypeScript engineer.' },
      { role: 'user', content: 'Write a LRU cache in TypeScript.' },
    ],
    agentContext: {
      agentId: 'code-refactor-agent',
      sessionId: 'session-xyz',
      taskId: 'task-101',
      stage: 'generation',
    },
  });

  console.log(`Model Used:    ${response.modelUsed}`);
  console.log(`Tokens:        ${response.totalTokens} (input: ${response.inputTokens}, output: ${response.outputTokens})`);
  console.log(`Cost:          $${response.cost.toFixed(6)}`);
  console.log(`Latency:       ${response.latencyMs}ms`);
  console.log(`Agent ID:      ${response.agentContext?.agentId}`);
  console.log(`Agent Stage:   ${response.agentContext?.stage}`);
  console.log(`Response text: ${response.text.substring(0, 80)}...`);
}

if (require.main === module) {
  main().catch(console.error);
}
