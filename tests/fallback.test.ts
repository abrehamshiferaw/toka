/**
 * Model Fallback Tests
 * These tests can be run manually to verify fallback functionality
 */

import { getNextModel, getModelWithinBudget, ModelFallbackHandler } from '../src/fallback/modelFallback';
import { estimateCost } from '../src/cost/estimator';

// Test data
const modelList = ['gpt-4', 'gpt-4o-mini', 'gpt-3.5'];
const shortPrompt = 'Hello world';
const longPrompt = 'This is a very long prompt that should exceed the budget for expensive models. '.repeat(100);

console.log('=== Model Fallback Tests ===\n');

// Test 1: getNextModel function
console.log('Test 1: getNextModel function');
console.log('getNextModel("gpt-4", modelList):', getNextModel('gpt-4', modelList)); // Should return 'gpt-4o-mini'
console.log('getNextModel("gpt-4o-mini", modelList):', getNextModel('gpt-4o-mini', modelList)); // Should return 'gpt-3.5'
console.log('getNextModel("gpt-3.5", modelList):', getNextModel('gpt-3.5', modelList)); // Should return null
console.log('getNextModel("unknown-model", modelList):', getNextModel('unknown-model', modelList)); // Should return null
console.log('');

// Test 2: getModelWithinBudget function
console.log('Test 2: getModelWithinBudget function');
console.log('getModelWithinBudget(shortPrompt, modelList, 1.0):', getModelWithinBudget(shortPrompt, modelList, 1.0)); // Should return 'gpt-4'
console.log('getModelWithinBudget(shortPrompt, modelList, 0.00001):', getModelWithinBudget(shortPrompt, modelList, 0.00001)); // Should return 'gpt-3.5'
console.log('getModelWithinBudget(longPrompt, modelList, 0.000001):', getModelWithinBudget(longPrompt, modelList, 0.000001)); // Should return null
console.log('');

// Test 3: ModelFallbackHandler class
console.log('Test 3: ModelFallbackHandler class');
const handler = new ModelFallbackHandler(modelList, 0.01);
console.log('handler.getBestModelForPrompt("Hello world"):', handler.getBestModelForPrompt('Hello world')); // Should return 'gpt-4'
console.log('handler.getNextFallbackModel("gpt-4"):', handler.getNextFallbackModel('gpt-4')); // Should return 'gpt-4o-mini'
console.log('handler.getNextFallbackModel("gpt-3.5"):', handler.getNextFallbackModel('gpt-3.5')); // Should return null
console.log('handler.isModelAvailable("gpt-4"):', handler.isModelAvailable('gpt-4')); // Should return true
console.log('handler.isModelAvailable("unknown-model"):', handler.isModelAvailable('unknown-model')); // Should return false
console.log('handler.getAvailableModels():', handler.getAvailableModels()); // Should return ['gpt-4', 'gpt-4o-mini', 'gpt-3.5']
console.log('');

// Test 4: Integration with cost estimation
console.log('Test 4: Integration with cost estimation');
const gpt4Cost = estimateCost(shortPrompt, 'gpt-4');
const gpt35Cost = estimateCost(shortPrompt, 'gpt-3.5');
console.log('Cost for gpt-4:', gpt4Cost.cost);
console.log('Cost for gpt-3.5:', gpt35Cost.cost);
console.log('gpt-4 more expensive than gpt-3.5:', gpt4Cost.cost > gpt35Cost.cost);
console.log('');

// Test 5: Model fallback sequence
console.log('Test 5: Model fallback sequence');
const budget = 0.00001; // Very low budget
let currentModel = 'gpt-4';
let attempts = 0;
let selectedModel: string | null = null;

console.log(`Starting with model: ${currentModel}, budget: $${budget}`);
while (attempts < modelList.length && !selectedModel) {
  const cost = estimateCost(shortPrompt, currentModel);
  console.log(`  Checking ${currentModel}: cost $${cost.cost.toFixed(6)}`);
  
  if (cost.cost <= budget) {
    selectedModel = currentModel;
    console.log(`  ✓ Selected model: ${selectedModel}`);
  } else {
    currentModel = getNextModel(currentModel, modelList) || '';
    attempts++;
    console.log(`  ✗ Too expensive, trying next model...`);
  }
}

if (!selectedModel) {
  console.log('  ✗ No model fits within budget');
}
console.log('');

console.log('=== Tests Complete ===');