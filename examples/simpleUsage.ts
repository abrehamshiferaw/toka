import { OpenAIProvider, Toka } from '../src';

async function main(): Promise<void> {
  const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
  const toka = new Toka(
    { models: ['gpt-4o-mini'], maxCostPerRequest: 1 },
    undefined,
    provider
  );
  const response = await toka.complete({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello from Toka.' }],
  });
  console.log({
    text: response.text,
    tokens: response.totalTokens,
    cost: response.cost,
    costSource: response.costSource,
  });
}

void main();
