import { Toka, MockProvider, RoutingPolicy } from '../../src';

async function main() {
  console.log('--- Toka: Smart Model Routing Example ---');

  const toka = new Toka(
    {
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
      maxCostPerRequest: 1.0,
    },
    undefined,
    new MockProvider()
  );

  const policies: RoutingPolicy[] = ['strict-model', 'cheapest', 'balanced', 'quality-first'];

  for (const policy of policies) {
    console.log(`\nEvaluating Policy: '${policy}'`);
    const res = await toka.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Parse this JSON and format into a Markdown table.' }],
      routing: policy,
    });

    const decision = res.routingDecision;
    if (decision) {
      console.log(`  Requested Model:   ${decision.requestedModel}`);
      console.log(`  Actual Model:      ${decision.actualModel}`);
      console.log(`  Changed:           ${decision.changed ? 'YES' : 'NO'}`);
      console.log(`  Estimated Cost:    $${decision.estimatedCost.toFixed(6)}`);
      console.log(`  Estimated Savings: $${decision.estimatedSavings.toFixed(6)}`);
      console.log(`  Why it changed:    ${decision.reason}`);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
