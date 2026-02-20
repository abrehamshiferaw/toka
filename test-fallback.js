/**
 * Simple test script to verify fallback functionality
 */

// Import the fallback functions directly
const { getNextModel, getModelWithinBudget } = require('./src/fallback/modelFallback');
const { estimateCost } = require('./src/cost/estimator');

console.log('=== Testing Fallback Functionality ===\n');

// Test data
const modelList = ['gpt-4', 'gpt-4o-mini', 'gpt-3.5'];
const shortPrompt = 'Hello world';
const longPrompt = 'This is a very long prompt that should exceed the budget for expensive models. '.repeat(100);

console.log('1. Testing getNextModel function:');
console.log('   getNextModel("gpt-4", modelList):', getNextModel('gpt-4', modelList));
console.log('   getNextModel("gpt-4o-mini", modelList):', getNextModel('gpt-4o-mini', modelList));
console.log('   getNextModel("gpt-3.5", modelList):', getNextModel('gpt-3.5', modelList));
console.log('   getNextModel("unknown-model", modelList):', getNextModel('unknown-model', modelList));
console.log('');

console.log('2. Testing getModelWithinBudget function:');
console.log('   getModelWithinBudget(shortPrompt, modelList, 1.0):', getModelWithinBudget(shortPrompt, modelList, 1.0));
console.log('   getModelWithinBudget(shortPrompt, modelList, 0.00001):', getModelWithinBudget(shortPrompt, modelList, 0.00001));
console.log('   getModelWithinBudget(longPrompt, modelList, 0.000001):', getModelWithinBudget(longPrompt, modelList, 0.000001));
console.log('');

console.log('3. Testing cost estimation:');
const gpt4Cost = estimateCost(shortPrompt, 'gpt-4');
const gpt35Cost = estimateCost(shortPrompt, 'gpt-3.5');
console.log('   Cost for gpt-4:', gpt4Cost.cost);
console.log('   Cost for gpt-3.5:', gpt35Cost.cost);
console.log('   gpt-4 more expensive than gpt-3.5:', gpt4Cost.cost > gpt35Cost.cost);
console.log('');

console.log('4. Testing model fallback sequence:');
const budget = 0.00001; // Very low budget
let currentModel = 'gpt-4';
let attempts = 0;
let selectedModel = null;

console.log(`   Starting with model: ${currentModel}, budget: $${budget}`);
while (attempts < modelList.length && !selectedModel) {
  const cost = estimateCost(shortPrompt, currentModel);
  console.log(`     Checking ${currentModel}: cost $${cost.cost.toFixed(6)}`);
  
  if (cost.cost <= budget) {
    selectedModel = currentModel;
    console.log(`     ✓ Selected model: ${selectedModel}`);
  } else {
    currentModel = getNextModel(currentModel, modelList) || '';
    attempts++;
    console.log(`     ✗ Too expensive, trying next model...`);
  }
}

if (!selectedModel) {
  console.log('     ✗ No model fits within budget');
}
console.log('');

console.log('=== Fallback Tests Complete ===');