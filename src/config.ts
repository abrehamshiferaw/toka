import * as fs from 'fs';
import { TokaConfigurationError } from './errors';
import { DEFAULT_CACHE_TTL_MS, DEFAULT_TIMEOUT_MS, SDKConfig } from './types';

function parseNumber(value: string, field: string): number { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new TokaConfigurationError(`${field} must be a finite number.`); return parsed; }

export function validateConfig(input: Partial<SDKConfig>): SDKConfig {
  if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new TokaConfigurationError('apiKey must be a string when provided.');
  if (!Array.isArray(input.models) || input.models.length === 0) throw new TokaConfigurationError('models must be a non-empty array.');
  if (input.models.some((model) => typeof model !== 'string' || model.trim() === '')) throw new TokaConfigurationError('models must contain only non-empty strings.');
  if (typeof input.maxCostPerRequest !== 'number' || !Number.isFinite(input.maxCostPerRequest) || input.maxCostPerRequest <= 0) throw new TokaConfigurationError('maxCostPerRequest must be a finite number greater than 0.');
  const cacheTTL = input.cacheTTL ?? DEFAULT_CACHE_TTL_MS;
  if (!Number.isFinite(cacheTTL) || cacheTTL < 0) throw new TokaConfigurationError('cacheTTL must be a finite, non-negative number of milliseconds.');
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TokaConfigurationError('timeoutMs must be a finite number greater than 0.');
  const retry = { maxRetries: input.retry?.maxRetries ?? 2, exponentialBackoff: input.retry?.exponentialBackoff ?? true, baseDelayMs: input.retry?.baseDelayMs ?? 250 };
  if (!Number.isInteger(retry.maxRetries) || retry.maxRetries < 0) throw new TokaConfigurationError('retry.maxRetries must be a non-negative integer.');
  if (!Number.isFinite(retry.baseDelayMs) || retry.baseDelayMs < 0) throw new TokaConfigurationError('retry.baseDelayMs must be a non-negative finite number.');
  if (typeof retry.exponentialBackoff !== 'boolean') throw new TokaConfigurationError('retry.exponentialBackoff must be boolean.');
  if (input.pricing) for (const [key, pricing] of Object.entries(input.pricing)) {
    if (!key.includes(':') || !Number.isFinite(pricing.inputPricePerMillionTokens) || pricing.inputPricePerMillionTokens < 0 || !Number.isFinite(pricing.outputPricePerMillionTokens) || pricing.outputPricePerMillionTokens < 0) throw new TokaConfigurationError(`Invalid pricing override '${key}'.`);
  }
  return { apiKey: input.apiKey, models: [...input.models], maxCostPerRequest: input.maxCostPerRequest, cacheTTL, timeoutMs, retry, pricing: input.pricing ? { ...input.pricing } : undefined };
}

export function loadConfig(configPath?: string): SDKConfig {
  let fileConfig: Partial<SDKConfig> = {};
  if (configPath) { try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<SDKConfig>; } catch (cause) { throw new TokaConfigurationError(`Failed to parse configuration file: ${configPath}`, { cause }); } }
  const envConfig: Partial<SDKConfig> = {};
  if (process.env.TOKA_API_KEY !== undefined) envConfig.apiKey = process.env.TOKA_API_KEY;
  if (process.env.OPENAI_API_KEY !== undefined && envConfig.apiKey === undefined) envConfig.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.TOKA_MODELS !== undefined) envConfig.models = process.env.TOKA_MODELS.split(',').map((model) => model.trim());
  if (process.env.TOKA_MAX_COST !== undefined) envConfig.maxCostPerRequest = parseNumber(process.env.TOKA_MAX_COST, 'TOKA_MAX_COST');
  if (process.env.TOKA_CACHE_TTL !== undefined) envConfig.cacheTTL = parseNumber(process.env.TOKA_CACHE_TTL, 'TOKA_CACHE_TTL');
  if (process.env.TOKA_TIMEOUT_MS !== undefined) envConfig.timeoutMs = parseNumber(process.env.TOKA_TIMEOUT_MS, 'TOKA_TIMEOUT_MS');
  return validateConfig({ ...fileConfig, ...envConfig });
}

export function createSampleConfig(): SDKConfig { return validateConfig({ apiKey: 'sample-api-key', models: ['gpt-4', 'gpt-3.5-turbo'], maxCostPerRequest: 1 }); }
