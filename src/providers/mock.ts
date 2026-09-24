import { TokaProviderError } from '../errors';
import {
  AIProvider,
  getMessageText,
  ProviderRequest,
  ProviderResponse,
  ProviderUsage,
} from '../types';

export class MockProvider implements AIProvider {
  readonly name = 'mock';

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.model.trim() || request.messages.length === 0) {
      throw new TokaProviderError(
        'Mock provider requires a model and at least one message.'
      );
    }
    const input = getMessageText(request.messages);
    const text = `Simulated response from ${request.model} for: ${input.slice(0, 50)}`;
    const usage: ProviderUsage = {
      inputTokens: Math.ceil(input.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      totalTokens: Math.ceil(input.length / 4) + Math.ceil(text.length / 4),
      isEstimated: true,
    };
    return { text, provider: this.name, modelUsed: request.model, usage };
  }
}

export function createMockProvider(): MockProvider {
  return new MockProvider();
}
