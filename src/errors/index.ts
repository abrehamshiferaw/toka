export type TokaErrorCode =
  | 'TOKA_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_REQUEST'
  | 'INVALID_MODEL'
  | 'RATE_LIMITED'
  | 'TIMEOUT_ERROR'
  | 'NETWORK_ERROR'
  | 'PROVIDER_SERVER_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'CACHE_ERROR'
  | 'CACHE_UNAVAILABLE'
  | 'PRICING_ERROR';

export interface TokaErrorOptions {
  cause?: unknown;
  provider?: string;
  model?: string;
  retryAfterMs?: number;
}

export class TokaError extends Error {
  readonly code: TokaErrorCode;
  readonly cause?: unknown;
  readonly provider?: string;
  readonly model?: string;
  readonly retryAfterMs?: number;
  constructor(
    message: string,
    code: TokaErrorCode = 'TOKA_ERROR',
    options: TokaErrorOptions = {}
  ) {
    super(message);
    this.name = 'TokaError';
    this.code = code;
    this.cause = options.cause;
    this.provider = options.provider;
    this.model = options.model;
    this.retryAfterMs = options.retryAfterMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class TokaConfigurationError extends TokaError {
  constructor(message: string, options?: TokaErrorOptions) {
    super(message, 'CONFIGURATION_ERROR', options);
    this.name = 'TokaConfigurationError';
  }
}
export class TokaProviderError extends TokaError {
  constructor(message: string, options?: TokaErrorOptions) {
    super(message, 'PROVIDER_ERROR', options);
    this.name = 'TokaProviderError';
  }
}
export class TokaAuthenticationError extends TokaProviderError {
  constructor(provider: string, cause?: unknown) {
    super('Provider authentication failed. Check the configured API key.', {
      provider,
      cause,
    });
    this.name = 'TokaAuthenticationError';
    Object.defineProperty(this, 'code', { value: 'AUTHENTICATION_ERROR' });
  }
}
export class TokaInvalidRequestError extends TokaProviderError {
  constructor(message: string, options?: TokaErrorOptions) {
    super(message, options);
    this.name = 'TokaInvalidRequestError';
    Object.defineProperty(this, 'code', { value: 'INVALID_REQUEST' });
  }
}
export class TokaInvalidModelError extends TokaProviderError {
  constructor(provider: string, model: string, cause?: unknown) {
    super(`Provider '${provider}' does not accept model '${model}'.`, {
      provider,
      model,
      cause,
    });
    this.name = 'TokaInvalidModelError';
    Object.defineProperty(this, 'code', { value: 'INVALID_MODEL' });
  }
}
export class TokaRateLimitError extends TokaProviderError {
  constructor(
    provider: string,
    model: string,
    retryAfterMs?: number,
    cause?: unknown
  ) {
    super('Provider rate limit exceeded.', {
      provider,
      model,
      retryAfterMs,
      cause,
    });
    this.name = 'TokaRateLimitError';
    Object.defineProperty(this, 'code', { value: 'RATE_LIMITED' });
  }
}
export class TokaTimeoutError extends TokaProviderError {
  constructor(
    message = 'The provider request timed out.',
    options?: TokaErrorOptions
  ) {
    super(message, options);
    this.name = 'TokaTimeoutError';
    Object.defineProperty(this, 'code', { value: 'TIMEOUT_ERROR' });
  }
}
export class TokaNetworkError extends TokaProviderError {
  constructor(provider: string, cause?: unknown) {
    super('The provider request failed due to a network error.', {
      provider,
      cause,
    });
    this.name = 'TokaNetworkError';
    Object.defineProperty(this, 'code', { value: 'NETWORK_ERROR' });
  }
}
export class TokaProviderServerError extends TokaProviderError {
  constructor(
    provider: string,
    model: string,
    status: number,
    cause?: unknown
  ) {
    super(`Provider server error (${status}).`, { provider, model, cause });
    this.name = 'TokaProviderServerError';
    Object.defineProperty(this, 'code', { value: 'PROVIDER_SERVER_ERROR' });
  }
}
export class TokaBudgetExceededError extends TokaError {
  constructor(message: string, options?: TokaErrorOptions) {
    super(message, 'BUDGET_EXCEEDED', options);
    this.name = 'TokaBudgetExceededError';
  }
}
export class TokaCacheError extends TokaError {
  constructor(message: string, options?: TokaErrorOptions) {
    super(message, 'CACHE_ERROR', options);
    this.name = 'TokaCacheError';
  }
}
export class TokaCacheUnavailableError extends TokaCacheError {
  constructor(message = 'Redis cache support is not implemented in Phase 1.') {
    super(message);
    this.name = 'TokaCacheUnavailableError';
    Object.defineProperty(this, 'code', { value: 'CACHE_UNAVAILABLE' });
  }
}
export class TokaPricingError extends TokaError {
  constructor(
    provider: string,
    model: string,
    reason = 'No pricing configuration is available.'
  ) {
    super(
      `${reason} Configure pricing for provider '${provider}' and model '${model}'.`,
      'PRICING_ERROR',
      { provider, model }
    );
    this.name = 'TokaPricingError';
  }
}
