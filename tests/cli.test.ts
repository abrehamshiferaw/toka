import { runCli } from '../src/cli';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 8: CLI Commands', () => {
  let logOutput: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    logOutput = [];
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('prints help message with --help', () => {
    runCli(['--help']);
    expect(logOutput.some((line) => line.includes('Usage:'))).toBe(true);
    expect(logOutput.some((line) => line.includes('toka <command>'))).toBe(true);
  });

  it('prints version with --version', () => {
    runCli(['--version']);
    expect(logOutput.some((line) => line.includes('toka-sdk v2.3.0'))).toBe(true);
  });

  it('lists registered models with pricing and tier', () => {
    runCli(['models']);
    expect(logOutput.some((line) => line.includes('TOKA MODEL REGISTRY'))).toBe(true);
    expect(logOutput.some((line) => line.includes('gpt-4o'))).toBe(true);
    expect(logOutput.some((line) => line.includes('flagship'))).toBe(true);
  });

  it('performs diagnostic check with check command', () => {
    runCli(['check']);
    expect(logOutput.some((line) => line.includes('Toka SDK installation and runtime check passed'))).toBe(true);
  });

  it('simulates smart model routing with route command', () => {
    runCli(['route', '--model', 'gpt-4o', '--policy', 'cheapest']);
    expect(logOutput.some((line) => line.includes('TOKA ROUTING DECISION'))).toBe(true);
    expect(logOutput.some((line) => line.includes('cheapest'))).toBe(true);
    expect(logOutput.some((line) => line.includes('Estimated Cost'))).toBe(true);
  });

  it('formats cost reports from a JSON file', () => {
    const tmpFile = path.join(__dirname, 'test-events.json');
    fs.writeFileSync(
      tmpFile,
      JSON.stringify([
        {
          id: '1',
          timestamp: new Date().toISOString(),
          provider: 'openai',
          model: 'gpt-4o',
          requestedModel: 'gpt-4o',
          actualModel: 'gpt-4o',
          tokens: { input: 10, output: 20, total: 30 },
          cost: { inputCost: 0.001, outputCost: 0.002, totalCost: 0.003, currency: 'USD' },
          costSource: 'actual',
          latencyMs: 40,
          cacheHit: false,
          fallbackOccurred: false,
          success: true,
          agentContext: { agentId: 'cli-agent', taskId: 't-1' },
        },
      ]),
      'utf8'
    );

    try {
      runCli(['report', tmpFile]);
      expect(logOutput.some((line) => line.includes('TOKA COST REPORT'))).toBe(true);
      expect(logOutput.some((line) => line.includes('Total Cost'))).toBe(true);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
