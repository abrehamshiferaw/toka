import { TokaProviderError } from '../errors';
import { createMockProvider } from '../providers/mock';

/** @deprecated Use Toka.complete() with an explicit MockProvider instead. */
export async function callAPI(
  model: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  if (!model || !prompt || !apiKey)
    throw new TokaProviderError('Model, prompt, and API key are required.');
  return (
    await createMockProvider().complete({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
  ).text;
}

export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4));
}

export function calculateCost(model: string, tokens: number): number {
  const prices: Record<string, number> = {
    'gpt-4': 0.03,
    'gpt-3.5-turbo': 0.002,
    'gpt-4-turbo': 0.01,
  };
  return (tokens * (prices[model] ?? 0.01)) / 1000;
}
