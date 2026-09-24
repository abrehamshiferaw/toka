import { Toka, MockProvider, TokaBudgetExceededError } from '../../src';

async function main() {
  console.log('--- Toka: Human Approval Flow Example ---');

  const toka = new Toka(
    {
      models: ['gpt-4', 'gpt-4o-mini'],
      budgets: {
        perRequest: 1.0,
        approvalRequiredAbove: 0.00005, // Threshold to trigger approval requirement
      },
    },
    undefined,
    new MockProvider()
  );

  const request = {
    model: 'gpt-4',
    messages: [
      {
        role: 'user' as const,
        content: 'Generate a comprehensive 50-page enterprise architecture review with detailed security threat modeling.',
      },
    ],
    maxTokens: 2000,
  };

  try {
    console.log('Attempting expensive request without approval flag...');
    await toka.complete(request);
    console.log('Unexpected: request completed without approval.');
  } catch (err) {
    if (err instanceof TokaBudgetExceededError && err.action === 'approval_required') {
      console.log(`[APPROVAL REQUIRED] Operation blocked: ${err.message}`);
      console.log(`Estimated Cost: $${err.requestedCost?.toFixed(6)} exceeds approval threshold of $0.00005.`);

      console.log('\n[HUMAN IN THE LOOP] Reviewing request and approving operation...');
      const approvedResponse = await toka.complete({
        ...request,
        budgetContext: { approved: true },
      });

      console.log('Execution Completed Successfully after approval:');
      console.log(`Model: ${approvedResponse.modelUsed}, Actual Cost: $${approvedResponse.cost.toFixed(6)}`);
    } else {
      throw err;
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
