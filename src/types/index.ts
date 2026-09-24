export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}
export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}
export interface RequestMetadata {
  requestId?: string;
  [key: string]: string | number | boolean | undefined;
}
export interface SDKRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  metadata?: RequestMetadata;
}
export interface ProviderRequest extends SDKRequest {}
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isEstimated: boolean;
}
export interface ProviderResponse {
  text: string;
  provider: string;
  modelUsed: string;
  usage?: ProviderUsage;
  raw?: unknown;
  metadata?: Record<string, unknown>;
}
export interface SDKResponse {
  text: string;
  provider: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCost?: number;
  outputCost?: number;
  cost: number;
  costSource: 'actual' | 'estimated';
  cacheHit: boolean;
  latencyMs: number;
}
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
export interface RetryConfig {
  maxRetries?: number;
  exponentialBackoff?: boolean;
  baseDelayMs?: number;
}
export interface SDKConfig {
  apiKey?: string;
  models: string[];
  maxCostPerRequest: number;
  cacheTTL?: number;
  timeoutMs?: number;
  retry?: RetryConfig;
  pricing?: Record<
    string,
    {
      inputPricePerMillionTokens: number;
      outputPricePerMillionTokens: number;
      currency?: 'USD';
      effectiveFrom?: string;
      version?: string;
    }
  >;
}
export interface AIProvider {
  readonly name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}
export interface LegacyRequestOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  metadata?: RequestMetadata;
  [key: string]: unknown;
}
export interface LegacySDKResponse extends SDKResponse {
  tokens: number;
}
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export type CacheEntry<T> = { value: T; expiresAt: number | null };
export type Config = SDKConfig;
export type Request = SDKRequest;
export type Response = SDKResponse;
export type ChatMessage = Message;
export function getMessageText(messages: Message[]): string {
  return messages.map((message) => message.content).join('\n');
}
export function cloneConfig(config: SDKConfig): SDKConfig {
  return {
    ...config,
    models: [...config.models],
    retry: config.retry ? { ...config.retry } : undefined,
    pricing: config.pricing ? { ...config.pricing } : undefined,
  };
}
export function normalizeLegacyOptions(
  options?: LegacyRequestOptions
): Partial<SDKRequest> {
  return options
    ? {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: options.tools,
        metadata: options.metadata,
      }
    : {};
}
