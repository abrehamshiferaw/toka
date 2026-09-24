import { MockProvider, Toka } from '../src';

async function main(): Promise<void> {
  const toka = new Toka(
    { models: ['demo-model'], maxCostPerRequest: 1 },
    undefined,
    new MockProvider()
  );

  const response = await toka.complete({
    model: 'demo-model',
    messages: [
      { role: 'user', content: 'Hello from the deterministic mock provider.' },
    ],
  });

  console.log(response.text);
  console.log({ provider: response.provider, costSource: response.costSource });
}

void main();
