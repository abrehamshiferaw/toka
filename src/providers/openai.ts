import {
  TokaAuthenticationError,
  TokaInvalidModelError,
  TokaInvalidRequestError,
  TokaNetworkError,
  TokaProviderServerError,
  TokaRateLimitError,
  TokaTimeoutError,
} from '../errors';
import { AIProvider, ProviderRequest, ProviderResponse } from '../types';

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  retry?: {
    maxRetries?: number;
    exponentialBackoff?: boolean;
    baseDelayMs?: number;
  };
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly exponentialBackoff: boolean;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseURL = (options.baseURL ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    );
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.retry?.maxRetries ?? 2;
    this.exponentialBackoff = options.retry?.exponentialBackoff ?? true;
    this.baseDelayMs = options.retry?.baseDelayMs ?? 250;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0)
      throw new Error('timeoutMs must be greater than 0.');
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0)
      throw new Error('retry.maxRetries must be a non-negative integer.');
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.apiKey) throw new TokaAuthenticationError(this.name);
    const body = {
      model: request.model,
      messages: request.messages,
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
      ...(request.maxTokens === undefined
        ? {}
        : { max_tokens: request.maxTokens }),
      ...(request.tools === undefined
        ? {}
        : {
            tools: request.tools.map((tool) => ({
              type: 'function',
              function: tool,
            })),
          }),
    };
    let attempt = 0;
    while (true) {
      try {
        return await this.send(body, request.model);
      } catch (error) {
        if (!this.isRetryable(error) || attempt >= this.maxRetries) throw error;
        const retryAfter =
          error instanceof TokaRateLimitError ? error.retryAfterMs : undefined;
        const delay =
          retryAfter ??
          (this.exponentialBackoff
            ? this.baseDelayMs * 2 ** attempt
            : this.baseDelayMs);
        attempt += 1;
        await this.sleep(Math.min(delay, 30_000));
      }
    }
  }

  private async send(
    body: Record<string, unknown>,
    requestedModel: string
  ): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError')
          throw new TokaTimeoutError(undefined, {
            provider: this.name,
            model: requestedModel,
            cause,
          });
        throw new TokaNetworkError(this.name, cause);
      }
      const payload = await this.readPayload(response);
      if (!response.ok)
        throw this.mapError(
          response.status,
          response.headers,
          payload,
          requestedModel
        );
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !payload.choices?.length)
        throw new TokaInvalidRequestError(
          'Provider returned a malformed completion response.',
          { provider: this.name, model: requestedModel }
        );
      const usage =
        payload.usage &&
        typeof payload.usage.prompt_tokens === 'number' &&
        typeof payload.usage.completion_tokens === 'number'
          ? {
              inputTokens: payload.usage.prompt_tokens,
              outputTokens: payload.usage.completion_tokens,
              totalTokens:
                payload.usage.total_tokens ??
                payload.usage.prompt_tokens + payload.usage.completion_tokens,
              isEstimated: false,
            }
          : undefined;
      return {
        text,
        provider: this.name,
        modelUsed: payload.model ?? requestedModel,
        usage,
        raw: payload,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async readPayload(response: Response): Promise<OpenAIResponse> {
    try {
      return (await response.json()) as OpenAIResponse;
    } catch {
      return {};
    }
  }

  private mapError(
    status: number,
    headers: Headers,
    payload: OpenAIResponse,
    model: string
  ): Error {
    const retryAfterHeader = headers.get('retry-after');
    const retryAfterMs = retryAfterHeader
      ? this.parseRetryAfter(retryAfterHeader)
      : undefined;
    if (status === 401 || status === 403)
      return new TokaAuthenticationError(this.name);
    if (status === 404 || payload.error?.code === 'model_not_found')
      return new TokaInvalidModelError(this.name, model);
    if (status === 429)
      return new TokaRateLimitError(this.name, model, retryAfterMs);
    if (status >= 500)
      return new TokaProviderServerError(this.name, model, status);
    return new TokaInvalidRequestError(
      payload.error?.message
        ? 'Provider rejected the request.'
        : 'Provider returned an invalid request response.',
      { provider: this.name, model }
    );
  }

  private isRetryable(error: unknown): boolean {
    return (
      error instanceof TokaRateLimitError ||
      error instanceof TokaTimeoutError ||
      error instanceof TokaProviderServerError ||
      error instanceof TokaNetworkError
    );
  }

  private parseRetryAfter(value: string): number | undefined {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? Math.max(0, timestamp - Date.now())
      : undefined;
  }
}
