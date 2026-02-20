/**
 * Model Fallback Module
 * Handles automatic model fallback when cost exceeds budget
 */

/**
 * Get the next model in the fallback list
 * @param currentModel The current model that exceeded the budget
 * @param modelList Ordered list of models by preference (most expensive first)
 * @returns The next cheaper model in the list, or null if no more fallbacks available
 */
export function getNextModel(currentModel: string, modelList: string[]): string | null {
  // Find the index of the current model in the list
  const currentIndex = modelList.indexOf(currentModel);
  
  // If current model is not in the list or is the last one, no fallback available
  if (currentIndex === -1 || currentIndex === modelList.length - 1) {
    return null;
  }
  
  // Return the next model in the list (cheaper option)
  return modelList[currentIndex + 1];
}

/**
 * Get the most expensive model from the list that fits within the budget
 * @param prompt The prompt to estimate cost for
 * @param modelList Ordered list of models by preference (most expensive first)
 * @param maxCostPerRequest Maximum allowed cost per request
 * @returns The most expensive model that fits within budget, or null if none fit
 */
export function getModelWithinBudget(
  prompt: string, 
  modelList: string[], 
  maxCostPerRequest: number
): string | null {
  // Import the cost estimator function
  const { estimateCost } = require('../cost/estimator');
  
  // Try each model in order (most expensive first)
  for (const model of modelList) {
    try {
      const costEstimate = estimateCost(prompt, model);
      
      // If this model fits within budget, return it
      if (costEstimate.cost <= maxCostPerRequest) {
        return model;
      }
    } catch (error) {
      // If cost estimation fails for this model, continue to next
      continue;
    }
  }
  
  // No model fits within budget
  return null;
}

/**
 * Class-based fallback handler for more complex scenarios
 */
export class ModelFallbackHandler {
  private modelList: string[];
  private maxCostPerRequest: number;

  constructor(modelList: string[], maxCostPerRequest: number) {
    this.modelList = modelList;
    this.maxCostPerRequest = maxCostPerRequest;
  }

  /**
   * Get the best model that fits within budget for a given prompt
   * @param prompt The prompt to estimate cost for
   * @returns The best model that fits within budget, or null if none fit
   */
  getBestModelForPrompt(prompt: string): string | null {
    return getModelWithinBudget(prompt, this.modelList, this.maxCostPerRequest);
  }

  /**
   * Get the next fallback model after a failed attempt
   * @param failedModel The model that failed (exceeded budget)
   * @returns The next fallback model, or null if no more available
   */
  getNextFallbackModel(failedModel: string): string | null {
    return getNextModel(failedModel, this.modelList);
  }

  /**
   * Check if a model is available in the fallback list
   * @param model The model to check
   * @returns True if model is in the fallback list
   */
  isModelAvailable(model: string): boolean {
    return this.modelList.includes(model);
  }

  /**
   * Get all available models in preference order
   * @returns Array of available models
   */
  getAvailableModels(): string[] {
    return [...this.modelList];
  }
}