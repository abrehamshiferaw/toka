"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
const estimator_1 = require("../src/cost/estimator");
const memoryCache_1 = require("../src/cache/memoryCache");
/**
 * Simple example demonstrating how to use the Toka SDK
 */
async function main() {
    console.log('🚀 Starting Toka SDK Example\n');
    // Method 1: Create Toka with sample configuration (for testing)
    console.log('📝 Method 1: Using sample configuration');
    const tokaWithSample = (0, index_1.createTokaWithSampleConfig)();
    try {
        const response1 = await tokaWithSample.request('gpt-4', 'Hello, world! How are you today?');
        console.log('✅ Response from gpt-4:');
        console.log(`   Text: ${response1.text}`);
        console.log(`   Tokens: ${response1.tokens}`);
        console.log(`   Cost: $${response1.cost.toFixed(4)}`);
        console.log(`   Model Used: ${response1.modelUsed}`);
        console.log(`   Cache Hit: ${response1.cacheHit}\n`);
    }
    catch (error) {
        console.error('❌ Error:', error.message);
    }
    // Method 2: Create Toka with custom configuration
    console.log('📝 Method 2: Using custom configuration');
    const customConfig = {
        apiKey: 'your-api-key-here',
        models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
        maxCostPerRequest: 0.5, // $0.50 maximum per request
        cacheTTL: 10 * 60 * 1000, // 10 minutes cache
    };
    const toka = new index_1.Toka(customConfig);
    try {
        const response2 = await toka.request('gpt-3.5-turbo', 'What is the capital of France?');
        console.log('✅ Response from gpt-3.5-turbo:');
        console.log(`   Text: ${response2.text}`);
        console.log(`   Tokens: ${response2.tokens}`);
        console.log(`   Cost: $${response2.cost.toFixed(4)}`);
        console.log(`   Model Used: ${response2.modelUsed}`);
        console.log(`   Cache Hit: ${response2.cacheHit}\n`);
    }
    catch (error) {
        console.error('❌ Error:', error.message);
    }
    // Method 3: Using configuration from environment variables or file
    console.log('📝 Method 3: Using configuration from environment');
    try {
        // This would load from environment variables or a config file
        // For this example, we'll simulate it with a config object
        const envConfig = {
            apiKey: process.env.TOKA_API_KEY || 'env-api-key',
            models: process.env.TOKA_MODELS ? process.env.TOKA_MODELS.split(',') : ['gpt-4'],
            maxCostPerRequest: parseFloat(process.env.TOKA_MAX_COST || '1.0'),
            cacheTTL: parseInt(process.env.TOKA_CACHE_TTL || '300000'), // 5 minutes
        };
        const tokaFromEnv = new index_1.Toka(envConfig);
        // Check if a model is available
        console.log('🔍 Checking model availability:');
        console.log(`   gpt-4 available: ${tokaFromEnv.isModelAvailable('gpt-4')}`);
        console.log(`   gpt-3 available: ${tokaFromEnv.isModelAvailable('gpt-3')}\n`);
        const response3 = await tokaFromEnv.request('gpt-4', 'Tell me a joke about programming.');
        console.log('✅ Response from gpt-4 (env config):');
        console.log(`   Text: ${response3.text}`);
        console.log(`   Tokens: ${response3.tokens}`);
        console.log(`   Cost: $${response3.cost.toFixed(4)}`);
        console.log(`   Model Used: ${response3.modelUsed}`);
        console.log(`   Cache Hit: ${response3.cacheHit}\n`);
    }
    catch (error) {
        console.error('❌ Error:', error.message);
    }
    // Phase 2: Cost Estimation Examples
    console.log('📊 Phase 2: Cost Estimation Examples');
    const samplePrompt = 'Hello, world! This is a test prompt for cost estimation.';
    // Direct cost estimation
    console.log('\n--- Direct Cost Estimation ---');
    const costEstimate = (0, estimator_1.estimateCost)(samplePrompt, 'gpt-4');
    console.log(`Prompt: "${samplePrompt}"`);
    console.log(`Estimated tokens: ${costEstimate.tokens}`);
    console.log(`Estimated cost: $${costEstimate.cost.toFixed(6)}`);
    // Token counting
    console.log('\n--- Token Counting ---');
    const tokenCount = (0, estimator_1.countTokens)(samplePrompt);
    console.log(`Simple token count: ${tokenCount}`);
    // Model prices
    console.log('\n--- Model Prices ---');
    const models = ['gpt-4', 'gpt-4o-mini', 'gpt-3.5-turbo', 'unknown-model'];
    models.forEach(model => {
        const price = (0, estimator_1.getModelPrice)(model);
        console.log(`${model}: $${price} per 1000 tokens`);
    });
    // Cost comparison across models
    console.log('\n--- Cost Comparison ---');
    models.forEach(model => {
        const estimate = (0, estimator_1.estimateCost)(samplePrompt, model);
        console.log(`${model}: ${estimate.tokens} tokens, $${estimate.cost.toFixed(6)}`);
    });
    // Demonstrate configuration updates
    console.log('\n📝 Method 4: Updating configuration');
    try {
        const tokaForUpdates = (0, index_1.createTokaWithSampleConfig)();
        console.log('   Original config:');
        const originalConfig = tokaForUpdates.getConfig();
        console.log(`     Max Cost: $${originalConfig.maxCostPerRequest}`);
        console.log(`     Models: ${originalConfig.models.join(', ')}`);
        // Update configuration
        tokaForUpdates.updateConfig({
            maxCostPerRequest: 2.0,
            models: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
        });
        console.log('   Updated config:');
        const updatedConfig = tokaForUpdates.getConfig();
        console.log(`     Max Cost: $${updatedConfig.maxCostPerRequest}`);
        console.log(`     Models: ${updatedConfig.models.join(', ')}\n`);
    }
    catch (error) {
        console.error('❌ Error:', error.message);
    }
    // Phase 3: Caching Examples
    console.log('\n💾 Phase 3: Caching Examples');
    console.log('\n--- In-Memory Cache Demo ---');
    const cache = new memoryCache_1.MemoryCache();
    // Test basic cache operations
    console.log('Storing values in cache...');
    cache.set('key1', 'Hello World');
    cache.set('key2', 42);
    cache.set('key3', { name: 'test', value: 123 });
    console.log('Retrieving values from cache:');
    console.log(`key1: ${cache.get('key1')}`);
    console.log(`key2: ${cache.get('key2')}`);
    console.log(`key3: ${JSON.stringify(cache.get('key3'))}`);
    // Test TTL functionality
    console.log('\n--- TTL (Time-To-Live) Demo ---');
    cache.set('temp-key', 'This will expire', 1000); // 1 second TTL
    console.log(`temp-key (immediately): ${cache.get('temp-key')}`);
    setTimeout(() => {
        console.log(`temp-key (after 1.5s): ${cache.get('temp-key') || 'EXPIRED'}`);
    }, 1500);
    // Test Toka with caching
    console.log('\n--- Toka SDK with Caching ---');
    const cachedConfig = {
        apiKey: 'test-api-key',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        maxCostPerRequest: 1.0,
        cacheTTL: 5000, // 5 seconds
    };
    const tokaWithCache = new index_1.Toka(cachedConfig, cache);
    const testPrompt = 'What is the meaning of life?';
    console.log('Making first request (should hit API)...');
    const response1 = await tokaWithCache.request('gpt-4', testPrompt);
    console.log(`Response: ${response1.text.substring(0, 50)}...`);
    console.log(`Cache Hit: ${response1.cacheHit}`);
    console.log('\nMaking second request (should hit cache)...');
    const response2 = await tokaWithCache.request('gpt-4', testPrompt);
    console.log(`Response: ${response2.text.substring(0, 50)}...`);
    console.log(`Cache Hit: ${response2.cacheHit}`);
    console.log('\n🎉 Toka SDK Example completed successfully!');
    console.log('\n✨ Key Features Demonstrated:');
    console.log('• Configuration management (sample, custom, environment)');
    console.log('• Model availability checking');
    console.log('• Direct cost estimation with estimateCost()');
    console.log('• Token counting with countTokens()');
    console.log('• Model price lookup with getModelPrice()');
    console.log('• Cost tracking in SDKResponse objects');
    console.log('• Cost validation before API calls');
    console.log('• In-Memory caching with TTL support');
    console.log('• Cache integration in Toka SDK');
    console.log('• Cache hit/miss tracking in responses');
    // Phase 4: Auto Model Fallback Examples
    console.log('\n🔄 Phase 4: Auto Model Fallback Examples');
    console.log('\n--- Model Fallback Demo ---');
    const fallbackConfig = {
        apiKey: 'test-api-key',
        models: ['gpt-4', 'gpt-4o-mini', 'gpt-3.5-turbo'], // Model preference order
        maxCostPerRequest: 0.00001, // Very low budget to trigger fallback
        cacheTTL: 5000,
    };
    const tokaWithFallback = new index_1.Toka(fallbackConfig);
    const fallbackPrompt = 'Hello world';
    console.log('Making request with gpt-4 (should fallback due to budget)');
    try {
        const fallbackResponse = await tokaWithFallback.request('gpt-4', fallbackPrompt);
        console.log(`✅ Request completed successfully!`);
        console.log(`   Requested model: gpt-4`);
        console.log(`   Model actually used: ${fallbackResponse.modelUsed}`);
        console.log(`   Cost: $${fallbackResponse.cost.toFixed(6)}`);
        console.log(`   Fallback occurred: ${fallbackResponse.modelUsed !== 'gpt-4'}`);
    }
    catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    console.log('\n--- Budget Exceeded Demo ---');
    const veryLowBudgetConfig = {
        apiKey: 'test-api-key',
        models: ['gpt-4', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        maxCostPerRequest: 0.0000001, // Extremely low budget
        cacheTTL: 5000,
    };
    const tokaVeryLowBudget = new index_1.Toka(veryLowBudgetConfig);
    const longPrompt = 'This is a very long prompt that should exceed the budget for all models. '.repeat(100);
    console.log('Making request with very low budget (should fail for all models)');
    try {
        const budgetExceededResponse = await tokaVeryLowBudget.request('gpt-4', longPrompt);
        console.log(`✅ Request completed: ${budgetExceededResponse.text.substring(0, 50)}...`);
    }
    catch (error) {
        console.log(`❌ Expected error: ${error.message}`);
    }
    console.log('\n--- Fallback with Long Prompt Demo ---');
    const moderateBudgetConfig = {
        apiKey: 'test-api-key',
        models: ['gpt-4', 'gpt-4o-mini', 'gpt-3.5-turbo'],
        maxCostPerRequest: 0.001, // Moderate budget
        cacheTTL: 5000,
    };
    const tokaModerateBudget = new index_1.Toka(moderateBudgetConfig);
    const longPrompt2 = 'This is a very long prompt that should exceed the budget for expensive models. '.repeat(50);
    console.log('Making request with long prompt (should fallback to cheaper model)');
    try {
        const longPromptResponse = await tokaModerateBudget.request('gpt-4', longPrompt2);
        console.log(`✅ Request completed successfully!`);
        console.log(`   Requested model: gpt-4`);
        console.log(`   Model actually used: ${longPromptResponse.modelUsed}`);
        console.log(`   Cost: $${longPromptResponse.cost.toFixed(6)}`);
        console.log(`   Fallback occurred: ${longPromptResponse.modelUsed !== 'gpt-4'}`);
    }
    catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    console.log('\n✨ Additional Features Demonstrated:');
    console.log('• Automatic model fallback when budget exceeded');
    console.log('• Model preference ordering (most expensive first)');
    console.log('• Cost-based model selection');
    console.log('• Graceful handling when no model fits budget');
    console.log('• ModelUsed field in SDKResponse shows actual model used');
}
// Run the example
main().catch(console.error);
//# sourceMappingURL=simpleUsage.js.map