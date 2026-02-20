import { callAPI, estimateTokens, calculateCost } from '../src/api/client';

/**
 * Test suite for API client functionality
 */
describe('API Client', () => {
  describe('callAPI', () => {
    it('should return a string response', async () => {
      const model = 'gpt-4';
      const prompt = 'Hello, world!';
      const apiKey = 'test-api-key';

      const response = await callAPI(model, prompt, apiKey);

      // Verify that the response is a string
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should throw error when required parameters are missing', async () => {
      await expect(callAPI('', 'prompt', 'apiKey')).rejects.toThrow('Model, prompt, and API key are required');
      await expect(callAPI('model', '', 'apiKey')).rejects.toThrow('Model, prompt, and API key are required');
      await expect(callAPI('model', 'prompt', '')).rejects.toThrow('Model, prompt, and API key are required');
    });

    it('should include model name in response', async () => {
      const model = 'gpt-3.5-turbo';
      const prompt = 'Test prompt';
      const apiKey = 'test-api-key';

      const response = await callAPI(model, prompt, apiKey);

      expect(response).toContain(model);
    });
  });

  describe('estimateTokens', () => {
    it('should return a positive number for non-empty text', () => {
      const text = 'This is a test prompt for token estimation.';
      const tokens = estimateTokens(text);

      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty text', () => {
      const tokens = estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should return 1 for very short text', () => {
      const tokens = estimateTokens('Hi');
      expect(tokens).toBe(1);
    });
  });

  describe('calculateCost', () => {
    it('should return a positive number for valid model and tokens', () => {
      const model = 'gpt-4';
      const tokens = 1000;
      const cost = calculateCost(model, tokens);

      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });

    it('should return 0 for 0 tokens', () => {
      const cost = calculateCost('gpt-4', 0);
      expect(cost).toBe(0);
    });

    it('should return different costs for different models', () => {
      const tokens = 1000;
      const costGPT4 = calculateCost('gpt-4', tokens);
      const costGPT35 = calculateCost('gpt-3.5-turbo', tokens);

      expect(costGPT4).not.toBe(costGPT35);
      expect(costGPT4).toBeGreaterThan(costGPT35);
    });

    it('should use default pricing for unknown models', () => {
      const cost = calculateCost('unknown-model', 1000);
      expect(cost).toBeGreaterThan(0);
    });
  });
});