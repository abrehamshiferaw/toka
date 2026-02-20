import * as fs from 'fs';
import * as path from 'path';
import { SDKConfig } from './types';

/**
 * Loads configuration from a JSON file or environment variables
 * @param configPath Optional path to a JSON config file
 * @returns SDKConfig object with validated configuration
 * @throws Error if required fields are missing or invalid
 */
export function loadConfig(configPath?: string): SDKConfig {
  let config: Partial<SDKConfig> = {};

  // Try to load from file first if path is provided
  if (configPath) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(configContent);
    } catch (error) {
      throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
  }

  // Load from environment variables, giving them priority over file config
  const envConfig: Partial<SDKConfig> = {
    apiKey: process.env.TOKA_API_KEY || config.apiKey,
    models: process.env.TOKA_MODELS ? process.env.TOKA_MODELS.split(',') : config.models,
    maxCostPerRequest: process.env.TOKA_MAX_COST ? parseFloat(process.env.TOKA_MAX_COST) : config.maxCostPerRequest,
    cacheTTL: process.env.TOKA_CACHE_TTL ? parseInt(process.env.TOKA_CACHE_TTL) : config.cacheTTL,
  };

  // Merge configurations (env vars take precedence)
  const finalConfig: Partial<SDKConfig> = { ...config, ...envConfig };

  // Validate required fields
  if (!finalConfig.apiKey) {
    throw new Error('API key is required. Set TOKA_API_KEY environment variable or provide in config file.');
  }

  if (!finalConfig.models || !Array.isArray(finalConfig.models) || finalConfig.models.length === 0) {
    throw new Error('Models array is required and must contain at least one model.');
  }

  if (!finalConfig.maxCostPerRequest || finalConfig.maxCostPerRequest <= 0) {
    throw new Error('maxCostPerRequest must be a positive number.');
  }

  // Set default cacheTTL if not provided (5 minutes)
  if (!finalConfig.cacheTTL) {
    finalConfig.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  return finalConfig as SDKConfig;
}

/**
 * Creates a sample configuration object for testing
 * @returns Sample SDKConfig for development/testing
 */
export function createSampleConfig(): SDKConfig {
  return {
    apiKey: 'sample-api-key',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    maxCostPerRequest: 1.0,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
  };
}