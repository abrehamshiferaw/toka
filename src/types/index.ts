/**
 * SDK Configuration interface
 * Defines the structure for Toka SDK configuration
 */
export interface SDKConfig {
  /** API key for authentication with AI provider */
  apiKey: string;
  /** List of available AI models */
  models: string[];
  /** Maximum cost allowed per request in USD */
  maxCostPerRequest: number;
  /** Optional cache time-to-live in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
}

/**
 * Cache interface for caching responses
 */
export interface Cache {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
}

/**
 * SDK Request interface
 * Defines the structure for API requests
 */
export interface SDKRequest {
  /** The AI model to use for this request */
  model: string;
  /** The prompt text to send to the AI model */
  prompt: string;
  /** Optional additional parameters for the request */
  options?: any;
}

/**
 * SDK Response interface
 * Defines the structure for API responses
 */
export interface SDKResponse {
  /** The generated text response from the AI model */
  text: string;
  /** Number of tokens used in the request/response */
  tokens: number;
  /** Estimated cost of this request in USD */
  cost: number;
  /** The model that was actually used for this request */
  modelUsed: string;
  /** Whether this response was served from cache */
  cacheHit?: boolean;
}