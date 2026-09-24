import { Toka, MockProvider, MemoryCache, AgentStage } from '../../src';

async function main() {
  console.log('--- Toka: Repository-Aware Multi-Stage Agent Example ---');

  const cache = new MemoryCache({ ttlMs: 60000 });
  const toka = new Toka(
    {
      models: ['gpt-4o', 'gpt-4o-mini'],
      maxCostPerRequest: 0.5,
    },
    cache,
    new MockProvider()
  );

  const repository = 'acme/webapp';
  const commitSha = 'c0ffee123456';
  const taskId = 'task-migrate-auth';

  const stages: AgentStage[] = [
    'classification',
    'discovery',
    'planning',
    'generation',
    'testing',
    'review',
    'final-response',
  ];

  for (const stage of stages) {
    const response = await toka.complete({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Execute stage ${stage} for repository ${repository}` }],
      agentContext: {
        agentId: 'repo-agent-01',
        repository,
        commitSha,
        taskId,
        stage,
      },
    });

    console.log(`[Stage: ${stage.padEnd(16)}] Cost: $${response.cost.toFixed(6)} | CacheHit: ${response.cacheHit}`);
  }

  // Second run with same commitSha -> hits cache
  console.log('\nRunning discovery stage again on SAME commit:');
  const cachedRes = await toka.complete({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Execute stage discovery for repository ${repository}` }],
    agentContext: {
      agentId: 'repo-agent-01',
      repository,
      commitSha,
      taskId,
      stage: 'discovery',
    },
  });
  console.log(`Result CacheHit: ${cachedRes.cacheHit} (Saved 100% cost!)`);

  // Run with NEW commitSha -> cache miss because code revision changed
  console.log('Running discovery stage on NEW commit (c0ffee789012):');
  const newCommitRes = await toka.complete({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Execute stage discovery for repository ${repository}` }],
    agentContext: {
      agentId: 'repo-agent-01',
      repository,
      commitSha: 'c0ffee789012',
      taskId,
      stage: 'discovery',
    },
  });
  console.log(`Result CacheHit: ${newCommitRes.cacheHit} (Fresh response generated for new code)`);

  console.log('\nCost Breakdown by Stage:');
  console.log(toka.getCostByStage());

  console.log(`\nTotal Spent on Repository '${repository}': $${Number(toka.getCostByRepository(repository)).toFixed(6)}`);
}

if (require.main === module) {
  main().catch(console.error);
}
