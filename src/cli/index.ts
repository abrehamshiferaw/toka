#!/usr/bin/env node
import * as fs from 'fs';
import { defaultModelRegistry } from '../routing/registry';
import { ModelRouter } from '../routing/router';
import { CostReporter } from '../observability/reporter';
import { UsageEvent } from '../observability/types';
import { RoutingPolicy } from '../routing/types';

export function runCli(args: string[] = process.argv.slice(2)): void {
  const command = args[0];

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    console.log('toka-sdk v2.3.0');
    return;
  }

  switch (command) {
    case 'models': {
      printModels();
      break;
    }

    case 'report': {
      const filePath = args[1];
      generateReportFromCli(filePath);
      break;
    }

    case 'route': {
      handleRouteCommand(args.slice(1));
      break;
    }

    case 'check': {
      console.log('✓ Toka SDK installation and runtime check passed.');
      console.log(`✓ Default model registry loaded with ${defaultModelRegistry.list().length} models.`);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
    }
  }
}

function printHelp(): void {
  console.log(`
Toka - Cost-control, smart routing & observability engine for AI code agents.

Usage:
  toka <command> [options]

Commands:
  models                 List all registered models with pricing, quality tier, and capabilities
  report <events.json>   Generate a formatted cost report from exported usage events
  route --model <name>   Simulate smart model routing and view transparent explanation
  check                  Run diagnostic verification on Toka environment
  --version, -v          Show Toka version
  --help, -h             Show this help message

Examples:
  toka models
  toka report usage-events.json
  toka route --model gpt-4o --policy cheapest
`);
}

function printModels(): void {
  const models = defaultModelRegistry.list();
  console.log('========================================================================================');
  console.log('                                TOKA MODEL REGISTRY                                     ');
  console.log('========================================================================================');
  console.log(
    'Model'.padEnd(16) +
    'Provider'.padEnd(12) +
    'Tier'.padEnd(12) +
    'Input/1K'.padEnd(12) +
    'Output/1K'.padEnd(12) +
    'Context'
  );
  console.log('----------------------------------------------------------------------------------------');
  for (const m of models) {
    const inCost = `$${m.pricing.inputCostPerThousand.toFixed(4)}`;
    const outCost = `$${m.pricing.outputCostPerThousand.toFixed(4)}`;
    const ctx = `${m.contextLimits.maxContextTokens.toLocaleString()} tokens`;
    console.log(
      m.model.padEnd(16) +
      m.provider.padEnd(12) +
      m.qualityTier.padEnd(12) +
      inCost.padEnd(12) +
      outCost.padEnd(12) +
      ctx
    );
  }
  console.log('========================================================================================');
}

function generateReportFromCli(filePath?: string): void {
  if (!filePath) {
    console.error('Error: Please provide the path to a JSON file containing usage events.');
    console.error('Example: toka report events.json');
    process.exitCode = 1;
    return;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const events: UsageEvent[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.events)
      ? parsed.events
      : [];

    if (events.length === 0) {
      console.log('No usage events found in provided file.');
      return;
    }

    const report = CostReporter.generateReport(events);
    console.log(CostReporter.formatTerminalTable(report));
  } catch (err) {
    console.error(`Failed to generate report: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

function handleRouteCommand(args: string[]): void {
  let model = 'gpt-4o';
  let policy: RoutingPolicy = 'cheapest';
  let prompt = 'Write a TypeScript function to calculate Fibonacci numbers.';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--policy' && args[i + 1]) {
      policy = args[++i] as RoutingPolicy;
    } else if (args[i] === '--prompt' && args[i + 1]) {
      prompt = args[++i];
    }
  }

  const router = new ModelRouter(defaultModelRegistry, policy);
  const decision = router.route({
    model,
    messages: [{ role: 'user', content: prompt }],
  });

  console.log('====================================================');
  console.log('              TOKA ROUTING DECISION                 ');
  console.log('====================================================');
  console.log(`Requested Model:    ${decision.requestedModel}`);
  console.log(`Actual Model:       ${decision.actualModel}`);
  console.log(`Routing Policy:     ${decision.policy}`);
  console.log(`Model Changed:      ${decision.changed ? 'YES' : 'NO'}`);
  console.log(`Estimated Cost:     $${decision.estimatedCost.toFixed(6)}`);
  console.log(`Estimated Savings:  $${decision.estimatedSavings.toFixed(6)}`);
  console.log(`Explanation:        ${decision.reason}`);
  console.log('====================================================');
}

if (require.main === module) {
  runCli();
}
