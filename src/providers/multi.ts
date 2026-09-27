import {
  TokaInvalidModelError,
  TokaInvalidRequestError,
  TokaProviderError,
} from '../errors';
import { AIProvider, ProviderRequest, ProviderResponse } from '../types';
import { OpenAIProvider, OpenAIProviderOptions } from './openai';
import { AnthropicProvider, AnthropicProviderOptions } from './anthropic';
import { GeminiProvider, GeminiProviderOptions } from './gemini';
import { MockProvider } from './mock';

export interface MultiProviderOptions {
  providers?: Map<string, AIProvider> | Record<string, AIProvider>;
  openaiOptions?: OpenAIProviderOptions;
  anthropicOptions?: AnthropicProviderOptions;
  geminiOptions?: GeminiProviderOptions;
  deepseekOptions?: OpenAIProviderOptions;
  defaultProvider?: string;
  allowMockFallback?: boolean;
}

export class MultiProvider implements AIProvider {
  readonly name = 'multi';
  private readonly providers = new Map<string, AIProvider>();
  private readonly defaultProvider?: string;

  constructor(options: MultiProviderOptions = {}) {
    this.defaultProvider = options.defaultProvider;

    // Register user-supplied providers if any
    if (options.providers) {
      const entries =
        options.providers instanceof Map
          ? options.providers.entries()
          : Object.entries(options.providers);
      for (const [name, provider] of entries) {
        this.providers.set(name.toLowerCase(), provider);
      }
    }

    // Auto-register built-in providers if not already registered
    if (!this.providers.has('openai')) {
      this.providers.set('openai', new OpenAIProvider(options.openaiOptions));
    }
    if (!this.providers.has('anthropic')) {
      this.providers.set('anthropic', new AnthropicProvider(options.anthropicOptions));
    }
    if (!this.providers.has('gemini')) {
      this.providers.set('gemini', new GeminiProvider(options.geminiOptions));
    }
    if (!this.providers.has('deepseek')) {
      this.providers.set(
        'deepseek',
        new OpenAIProvider({
          apiKey: options.deepseekOptions?.apiKey ?? process.env.DEEPSEEK_API_KEY,
          baseURL:
            options.deepseekOptions?.baseURL ?? 'https://api.deepseek.com/v1',
          ...options.deepseekOptions,
        })
      );
    }
    if (options.allowMockFallback && !this.providers.has('mock')) {
      this.providers.set('mock', new MockProvider());
    }
  }

  registerProvider(name: string, provider: AIProvider): this {
    this.providers.set(name.toLowerCase(), provider);
    return this;
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  resolveProviderForModel(model: string, explicitProvider?: string): AIProvider {
    if (explicitProvider && this.providers.has(explicitProvider.toLowerCase())) {
      return this.providers.get(explicitProvider.toLowerCase())!;
    }

    const lowerModel = model.toLowerCase();

    if (
      lowerModel.startsWith('gpt-') ||
      lowerModel.startsWith('o1') ||
      lowerModel.startsWith('o3') ||
      lowerModel.startsWith('chatgpt')
    ) {
      const p = this.providers.get('openai');
      if (p) return p;
    }

    if (lowerModel.startsWith('claude')) {
      const p = this.providers.get('anthropic');
      if (p) return p;
    }

    if (lowerModel.startsWith('gemini') || lowerModel.startsWith('gemma')) {
      const p = this.providers.get('gemini');
      if (p) return p;
    }

    if (lowerModel.startsWith('deepseek')) {
      const p = this.providers.get('deepseek');
      if (p) return p;
    }

    if (lowerModel.startsWith('mock') || lowerModel === 'demo') {
      const p = this.providers.get('mock');
      if (p) return p;
    }

    if (this.defaultProvider && this.providers.has(this.defaultProvider.toLowerCase())) {
      return this.providers.get(this.defaultProvider.toLowerCase())!;
    }

    // Default to openai if available, or first registered provider
    const openai = this.providers.get('openai');
    if (openai) return openai;

    const first = Array.from(this.providers.values())[0];
    if (first) return first;

    throw new TokaInvalidModelError('multi', model);
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!request.model) {
      throw new TokaInvalidRequestError('Model is required for completion.', {
        provider: this.name,
      });
    }

    const provider = this.resolveProviderForModel(
      request.model,
      request.metadata?.provider as string | undefined
    );

    try {
      return await provider.complete(request);
    } catch (error) {
      if (error instanceof TokaProviderError) {
        throw error;
      }
      throw new TokaProviderError(
        `Provider '${provider.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          provider: provider.name,
          model: request.model,
          cause: error,
        }
      );
    }
  }
}
