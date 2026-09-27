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
  ProviderRequest,
  ProviderResponse,
} from '../types';

export interface GeminiProviderOptions {
  apiKey?: string;
  baseURL?: string;
  apiVersion?: string;
  timeoutMs?: number;
  retry?: {
    maxRetries?: number;
    exponentialBackoff?: boolean;
    baseDelayMs?: number;
  };
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
    role?: string;
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly exponentialBackoff: boolean;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    const rawBase = options.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.baseURL = rawBase.replace(/\/$/, '');
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

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: ' ' }] });
    }

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemMessages.length > 0) {
      body.systemInstruction = {
        parts: [{ text: getMessageText(systemMessages) }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // Clean model name
    const modelClean = request.model.replace(/^models\//, '');

    let attempt = 0;
    while (true) {
      try {
        return await this.send(body, modelClean);
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

    const url = `${this.baseURL}/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey!)}`;

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | GeminiResponse
        | null;

      if (!response.ok) {
        this.handleHttpError(response.status, payload, model);
      }

      const candidate = payload?.candidates?.[0];
      const textParts = (candidate?.content?.parts ?? [])
        .map((p) => p.text || '')
        .filter(Boolean);
      const text = textParts.join('\n');

      const inputTokens = payload?.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = payload?.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        text,
        provider: this.name,
        modelUsed: model,
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
        throw new TokaTimeoutError(`Gemini request timed out after ${this.timeoutMs}ms`, {
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
    payload: GeminiResponse | null,
    model: string
  ): never {
    const message = payload?.error?.message || `Gemini request failed with status ${status}`;

    if (status === 401 || status === 403) {
      throw new TokaAuthenticationError(this.name);
    }
    if (status === 404) {
      throw new TokaInvalidModelError(this.name, model);
    }
    if (status === 429) {
      throw new TokaRateLimitError(this.name, model);
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
