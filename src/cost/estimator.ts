/**
 * Cost Estimator module for Toka SDK
 * Provides token counting and cost estimation functionality
 */

/**
 * Simple word-based token counting approximation
 * @param prompt The text prompt to count tokens for
 * @returns Estimated number of tokens
 */
export function countTokens(prompt: string): number {
  if (!prompt || prompt.trim().length === 0) {
    return 0;
  }
  
  // Simple approximation: count words separated by spaces
  // In reality, tokenization is more complex, but this provides a reasonable estimate
  const words = prompt.trim().split(/\s+/);
  return words.length;
}

/**
 * Calculate tokens with model-specific adjustments
 * Different models may have different tokenization patterns
 * @param prompt The text prompt to count tokens for
 * @param model The AI model being used
 * @returns Adjusted token count based on model
 */
export function calculateModelTokens(prompt: string, model: string): number {
  const baseTokens = countTokens(prompt);
  
  // Model-specific token multipliers (approximate)
  // These account for differences in tokenization between models
  const modelMultipliers: Record<string, number> = {
    'gpt-4': 1.1,        // GPT-4 tends to use slightly more tokens
    'gpt-4o-mini': 1.0,  // GPT-4o-mini similar to base
    'gpt-3.5-turbo': 1.05, // GPT-3.5-turbo slightly higher
    'gpt-4-turbo': 1.1,   // GPT-4-turbo similar to GPT-4
  };
  
  const multiplier = modelMultipliers[model] || 1.0;
  return Math.ceil(baseTokens * multiplier);
}

/**
 * Price per 1000 tokens for different models (in USD)
 * These are approximate prices for estimation purposes
 */
const modelPrices: Record<string, number> = {
  'gpt-4': 0.03,           // $0.03 per 1000 tokens
  'gpt-4o-mini': 0.015,    // $0.015 per 1000 tokens  
  'gpt-3.5-turbo': 0.007,  // $0.007 per 1000 tokens
  'gpt-4-turbo': 0.02,     // $0.02 per 1000 tokens
};

/**
 * Estimate the cost of a prompt for a specific model
 * @param prompt The text prompt to estimate cost for
 * @param model The AI model to use for cost calculation
 * @returns Object containing estimated tokens and cost
 */
export function estimateCost(prompt: string, model: string): { tokens: number; cost: number } {
  // Calculate tokens with model-specific adjustments
  const tokens = calculateModelTokens(prompt, model);
  
  // Get price per 1000 tokens for the model (default to $0.01 if not found)
  const pricePer1000Tokens = modelPrices[model] || 0.01;
  
  // Calculate cost: (tokens / 1000) * price per 1000 tokens
  const cost = (tokens / 1000) * pricePer1000Tokens;
  
  return {
    tokens,
    cost: Math.round(cost * 10000) / 10000 // Round to 4 decimal places for currency
  };
}

/**
 * Get the price per 1000 tokens for a model
 * @param model The AI model
 * @returns Price per 1000 tokens in USD
 */
export function getModelPrice(model: string): number {
  return modelPrices[model] || 0.01;
}

/**
 * Calculate total cost including response tokens (estimate)
 * @param promptTokens Number of tokens in the prompt
 * @param estimatedResponseTokens Estimated number of tokens in response
 * @param model The AI model being used
 * @returns Total estimated cost
 */
export function estimateTotalCost(promptTokens: number, estimatedResponseTokens: number, model: string): number {
  const totalTokens = promptTokens + estimatedResponseTokens;
  const pricePer1000Tokens = getModelPrice(model);
  const cost = (totalTokens / 1000) * pricePer1000Tokens;
  
  return Math.round(cost * 10000) / 10000;
}