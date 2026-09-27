import {
  TokaAuthenticationError,
  TokaInvalidModelError,
  TokaInvalidRequestError,
  TokaNetworkError,
  TokaProviderServerError,
  TokaRateLimitError,
  TokaTimeoutError,
} from '../errors';
import {
  AIProvider,
  getMessageText,
  Message,
  ProviderRequest,
  ProviderResponse,
} from '../types';

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
  anthropicVersion?: string;
  timeoutMs?: number;
  retry?: {
    maxRetries?: number;
    exponentialBackoff?: boolean;
    baseDelayMs?: number;
  };
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly anthropicVersion: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly exponentialBackoff: boolean;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: AnthropicProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseURL = (options.baseURL ?? 'https://api.anthropic.com/v1').replace(
      /\/$/,
      ''
    );
    this.anthropicVersion = options.anthropicVersion ?? '2023-06-01';
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.retry?.maxRetries ?? 2;
    this.exponentialBackoff = options.retry?.exponentialBackoff ?? true;
    this.baseDelayMs = options.retry?.baseDelayMs ?? 250;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('timeoutMs must be greater than 0.');
    }
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error('retry.maxRetries must be a non-negative integer.');
    }
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new TokaAuthenticationError(this.name);
    }

    // Separate system messages for Anthropic API
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const systemPrompt =
      systemMessages.length > 0 ? getMessageText(systemMessages) : undefined;

    const messages = nonSystemMessages.map((m: Message) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Ensure at least one message is present
    if (messages.length === 0) {
      messages.push({ role: 'user', content: ' ' });
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 2048,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    let attempt = 0;
    while (true) {
      try {
        return await this.send(body, request.model);
      } catch (error) {
        if (!this.isRetryable(error) || attempt >= this.maxRetries) {
          throw error;
        }
        const retryAfter =
          error instanceof TokaRateLimitError ? error.retryAfterMs : undefined;
        const delay =
          retryAfter ??
          (this.exponentialBackoff
            ? this.baseDelayMs * 2 ** attempt
            : this.baseDelayMs);
        await this.sleep(delay);
        attempt += 1;
      }
    }
  }

  private async send(
    body: Record<string, unknown>,
    model: string
  ): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': this.anthropicVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | AnthropicResponse
        | null;

      if (!response.ok) {
        this.handleHttpError(response.status, payload, model);
      }

      const textParts = (payload?.content ?? [])
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text!);

      const text = textParts.join('\n');
      const inputTokens = payload?.usage?.input_tokens ?? 0;
      const outputTokens = payload?.usage?.output_tokens ?? 0;

      return {
        text,
        provider: this.name,
        modelUsed: payload?.model || model,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          isEstimated: false,
        },
        raw: payload,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TokaTimeoutError(`Anthropic request timed out after ${this.timeoutMs}ms`, {
          provider: this.name,
          model,
          cause: error,
        });
      }
      if (
        error instanceof TokaAuthenticationError ||
        error instanceof TokaInvalidModelError ||
        error instanceof TokaInvalidRequestError ||
        error instanceof TokaRateLimitError ||
        error instanceof TokaTimeoutError ||
        error instanceof TokaProviderServerError
      ) {
        throw error;
      }
      throw new TokaNetworkError(this.name, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleHttpError(
    status: number,
    payload: AnthropicResponse | null,
    model: string
  ): never {
    const message = payload?.error?.message || `Anthropic request failed with status ${status}`;

    if (status === 401 || status === 403) {
      throw new TokaAuthenticationError(this.name);
    }
    if (status === 404) {
      throw new TokaInvalidModelError(this.name, model);
    }
    if (status === 429) {
      throw new TokaRateLimitError(this.name, model);
    }
    if (status === 400) {
      throw new TokaInvalidRequestError(message, {
        provider: this.name,
        model,
      });
    }
    if (status >= 500) {
      throw new TokaProviderServerError(this.name, model, status, payload);
    }

    throw new TokaInvalidRequestError(message, {
      provider: this.name,
      model,
    });
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof TokaRateLimitError ||
      error instanceof TokaTimeoutError ||
      error instanceof TokaProviderServerError ||
      error instanceof TokaNetworkError
    );
  }
}
