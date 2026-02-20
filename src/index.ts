import { SDKConfig, SDKRequest, SDKResponse, Cache } from './types';
import { callAPI } from './api/client';
import { estimateCost } from './cost/estimator';
import { createSampleConfig } from './config';

/**
 * Main Toka SDK class
 * Provides a simple interface for making AI API requests with cost tracking and optimization
 */
export class Toka {
  private config: SDKConfig;
  private cache?: Cache;

  /**
   * Initialize the Toka SDK with configuration and optional cache
   * @param config SDK configuration object
   * @param cache Optional cache instance for caching responses
   */
  constructor(config: SDKConfig, cache?: Cache) {
    this.config = config;
    this.cache = cache;
  }

  /**
   * Make a request to the AI API with cost estimation and caching
   * @param model The AI model to use (must be in config.models)
   * @param prompt The text prompt to send to the AI model
   * @param options Optional additional parameters for the request
   * @returns Promise<SDKResponse> The response containing text, tokens, cost, and model used
   */
  async request(model: string, prompt: string, options?: any): Promise<SDKResponse> {
    // Validate that the requested model is in the allowed list
    if (!this.config.models.includes(model)) {
      throw new Error(`Model '${model}' is not in the allowed models list. Allowed models: ${this.config.models.join(', ')}`);
    }

    // Check if request would exceed max cost
    if (this.config.maxCostPerRequest <= 0) {
      throw new Error('Maximum cost per request must be greater than 0');
    }

    try {
      // Generate cache key based on model, prompt, and options
      const cacheKey = this.generateCacheKey(model, prompt, options);
      
      // Check cache first if cache is available
      if (this.cache && this.cache.has(cacheKey)) {
        const cachedResponse = this.cache.get<SDKResponse>(cacheKey);
        if (cachedResponse) {
          console.log(`Cache hit for key: ${cacheKey}`);
          return { ...cachedResponse, cacheHit: true };
        }
      }

      // Estimate cost before making the API call
      const costEstimate = estimateCost(prompt, model);
      
      // Check if estimated cost exceeds maximum allowed
      if (costEstimate.cost > this.config.maxCostPerRequest) {
        throw new Error(`Estimated request cost ($${costEstimate.cost.toFixed(4)}) exceeds maximum allowed ($${this.config.maxCostPerRequest})`);
      }

      // Make the API call
      const text = await callAPI(model, prompt, this.config.apiKey);
      
      // Create response object with estimated tokens and cost
      const tokens = costEstimate.tokens;
      const cost = costEstimate.cost;
      
      const response: SDKResponse = {
        text,
        tokens,
        cost,
        modelUsed: model,
        cacheHit: false,
      };

      // Store response in cache if cache is available
      if (this.cache) {
        const ttl = this.config.cacheTTL || (5 * 60 * 1000); // Default 5 minutes
        this.cache.set(cacheKey, response, ttl);
        console.log(`Cached response for key: ${cacheKey} (TTL: ${ttl}ms)`);
      }

      return response;

    } catch (error: any) {
      // Re-throw with additional context if needed
      throw new Error(`Toka request failed: ${error.message}`);
    }
  }

  /**
   * Generate a cache key for the given request parameters
   * @param model The AI model used
   * @param prompt The prompt text
   * @param options Optional additional parameters
   * @returns A unique cache key string
   */
  private generateCacheKey(model: string, prompt: string, options?: any): string {
    // Create a simple hash of the model and prompt
    // In a real implementation, you might want to use a more sophisticated hashing approach
    const baseKey = `${model}:${prompt}`;
    
    if (options && Object.keys(options).length > 0) {
      // Include options in the key if they exist
      const optionsString = JSON.stringify(options);
      return `${baseKey}:${optionsString}`;
    }
    
    return baseKey;
  }

  /**
   * Get the current configuration
   * @returns Current SDK configuration
   */
  getConfig(): SDKConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   * @param newConfig Partial configuration to update
   */
  updateConfig(newConfig: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if a model is available
   * @param model The model to check
   * @returns boolean True if model is in the allowed list
   */
  isModelAvailable(model: string): boolean {
    return this.config.models.includes(model);
  }
}

/**
 * Create a Toka instance with sample configuration for testing
 * @returns Toka instance with sample configuration
 */
export function createTokaWithSampleConfig(): Toka {
  const sampleConfig = createSampleConfig();
  return new Toka(sampleConfig);
}
