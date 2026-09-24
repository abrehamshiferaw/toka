import { Toka, MockProvider, TokaBudgetExceededError } from '../../src';

async function main() {
  console.log('--- Toka: Budget-Aware Agent Example ---');

  const toka = new Toka(
    {
      models: ['gpt-4o', 'gpt-4o-mini'],
      budgets: {
        perRequest: 0.05,
        perTask: { limit: 0.10, warnThreshold: 0.7, action: 'block' },
        perSession: 0.50,
      },
    },
    undefined,
    new MockProvider()
  );

  toka.on('budgetWarning', (warning) => {
    console.warn(`[BUDGET WARNING] Scope '${warning.scope}' reached $${warning.spent.toFixed(4)} of $${warning.limit.toFixed(4)}`);
  });

  const taskId = 'refactor-auth-service';

  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`Executing Agent Step ${i}...`);
      const res = await toka.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Step ${i}: Analyze files and write patch.` }],
        agentContext: {
          agentId: 'refactor-bot',
          taskId,
          stage: i === 1 ? 'discovery' : i === 2 ? 'generation' : 'testing',
        },
      });
      console.log(`Step ${i} succeeded: cost = $${res.cost.toFixed(6)}, task spent = $${(await toka.getBudgetStatus({ taskId })).limits.task?.spent.toFixed(6)}`);
    } catch (err) {
      if (err instanceof TokaBudgetExceededError) {
        console.error(`[BUDGET BLOCKED] Step ${i} halted: ${err.message}`);
        console.error(`Scope: ${err.scope}, Limit: $${err.limit}, Spent: $${err.spent}`);
        break;
      }
      throw err;
    }
  }

  const status = await toka.getBudgetStatus({ taskId });
  console.log('Final Task Budget Status:', status);
}

if (require.main === module) {
  main().catch(console.error);
}
