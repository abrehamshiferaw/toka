import { Toka, createTokaWithSampleConfig } from '../src/index';
import { SDKConfig } from '../src/types';

/**
 * Test suite for Toka SDK main class
 */
describe('Toka SDK', () => {
  let toka: Toka;
  let sampleConfig: SDKConfig;

  beforeEach(() => {
    sampleConfig = {
      apiKey: 'test-api-key',
      models: ['gpt-4', 'gpt-3.5-turbo'],
      maxCostPerRequest: 1.0,
      cacheTTL: 5 * 60 * 1000,
    };
    toka = new Toka(sampleConfig);
  });

  describe('constructor', () => {
    it('should create Toka instance with valid config', () => {
      expect(toka).toBeInstanceOf(Toka);
      expect(toka.getConfig()).toEqual(sampleConfig);
    });

    it('should create instance with sample config', () => {
      const tokaWithSample = createTokaWithSampleConfig();
      expect(tokaWithSample).toBeInstanceOf(Toka);
      
      const config = tokaWithSample.getConfig();
      expect(config.apiKey).toBe('sample-api-key');
      expect(config.models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
      expect(config.maxCostPerRequest).toBe(1.0);
    });
  });

  describe('request', () => {
    it('should return an object with correct keys', async () => {
      const model = 'gpt-4';
      const prompt = 'Hello, world!';
      
      const response = await toka.request(model, prompt);

      // Verify response has all required keys
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('tokens');
      expect(response).toHaveProperty('cost');
      expect(response).toHaveProperty('modelUsed');
      expect(response).toHaveProperty('cacheHit');

      // Verify types
      expect(typeof response.text).toBe('string');
      expect(typeof response.tokens).toBe('number');
      expect(typeof response.cost).toBe('number');
      expect(typeof response.modelUsed).toBe('string');
      expect(typeof response.cacheHit).toBe('boolean');
    });

    it('should use the requested model', async () => {
      const model = 'gpt-3.5-turbo';
      const prompt = 'Test prompt';
      
      const response = await toka.request(model, prompt);

      expect(response.modelUsed).toBe(model);
    });

    it('should throw error for invalid model', async () => {
      const invalidModel = 'invalid-model';
      const prompt = 'Test prompt';

      await expect(toka.request(invalidModel, prompt)).rejects.toThrow(
        `Model '${invalidModel}' is not in the allowed models list. Allowed models: gpt-4, gpt-3.5-turbo`
      );
    });

    it('should throw error for zero max cost', async () => {
      const tokaWithZeroCost = new Toka({
        ...sampleConfig,
        maxCostPerRequest: 0,
      });

      await expect(tokaWithZeroCost.request('gpt-4', 'Test prompt')).rejects.toThrow(
        'Maximum cost per request must be greater than 0'
      );
    });
  });

  describe('getConfig', () => {
    it('should return a copy of the current configuration', () => {
      const config = toka.getConfig();
      
      // Modify returned config to ensure it's a copy
      config.maxCostPerRequest = 999;
      
      // Original config should not be affected
      const originalConfig = toka.getConfig();
      expect(originalConfig.maxCostPerRequest).toBe(1.0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxCostPerRequest: 2.0,
        cacheTTL: 10 * 60 * 1000,
      };

      toka.updateConfig(newConfig);

      const config = toka.getConfig();
      expect(config.maxCostPerRequest).toBe(2.0);
      expect(config.cacheTTL).toBe(10 * 60 * 1000);
      // Other properties should remain unchanged
      expect(config.apiKey).toBe('test-api-key');
      expect(config.models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    });
  });

  describe('isModelAvailable', () => {
    it('should return true for available models', () => {
      expect(toka.isModelAvailable('gpt-4')).toBe(true);
      expect(toka.isModelAvailable('gpt-3.5-turbo')).toBe(true);
    });

    it('should return false for unavailable models', () => {
      expect(toka.isModelAvailable('gpt-3')).toBe(false);
      expect(toka.isModelAvailable('invalid-model')).toBe(false);
    });
  });
});