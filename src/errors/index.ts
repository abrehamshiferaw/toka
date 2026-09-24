export type TokaErrorCode =
  | 'TOKA_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'CACHE_ERROR'
  | 'CACHE_UNAVAILABLE';

export class TokaError extends Error {
  readonly code: TokaErrorCode;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: TokaErrorCode = 'TOKA_ERROR',
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'TokaError';
    this.code = code;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TokaConfigurationError extends TokaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'CONFIGURATION_ERROR', options);
    this.name = 'TokaConfigurationError';
  }
}

export class TokaProviderError extends TokaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'PROVIDER_ERROR', options);
    this.name = 'TokaProviderError';
  }
}

export class TokaTimeoutError extends TokaProviderError {
  constructor(
    message = 'The provider request timed out.',
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'TokaTimeoutError';
    Object.defineProperty(this, 'code', { value: 'TIMEOUT_ERROR' });
  }
}

export class TokaBudgetExceededError extends TokaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'BUDGET_EXCEEDED', options);
    this.name = 'TokaBudgetExceededError';
  }
}

export class TokaCacheError extends TokaError {
  constructor(message: string, options?: { cause?: unknown }) {
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
