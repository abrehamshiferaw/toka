/**
 * Unit tests for the cost estimator module
 */

import { 
  estimateCost, 
  countTokens, 
  calculateModelTokens, 
  getModelPrice, 
  estimateTotalCost 
} from '../src/cost/estimator';

describe('Cost Estimator', () => {
  
  describe('countTokens', () => {
    it('should return 0 for empty or whitespace-only strings', () => {
      expect(countTokens('')).toBe(0);
      expect(countTokens('   ')).toBe(0);
      expect(countTokens('\n\t')).toBe(0);
    });

    it('should count words separated by spaces', () => {
      expect(countTokens('Hello world')).toBe(2);
      expect(countTokens('This is a test')).toBe(4);
      expect(countTokens('Single')).toBe(1);
    });

    it('should handle multiple spaces between words', () => {
      expect(countTokens('Hello    world')).toBe(2);
      expect(countTokens('This   is    a    test')).toBe(4);
    });

    it('should trim leading and trailing whitespace', () => {
      expect(countTokens('  Hello world  ')).toBe(2);
      expect(countTokens('\tHello world\n')).toBe(2);
    });
  });

  describe('calculateModelTokens', () => {
    it('should return base token count for unknown models', () => {
      const prompt = 'Hello world';
      const baseTokens = countTokens(prompt);
      expect(calculateModelTokens(prompt, 'unknown-model')).toBe(baseTokens);
    });

    it('should apply model-specific multipliers', () => {
      const prompt = 'Hello world this is a test';
      const baseTokens = countTokens(prompt); // 7 tokens
      
      // GPT-4 multiplier is 1.1
      expect(calculateModelTokens(prompt, 'gpt-4')).toBe(Math.ceil(baseTokens * 1.1));
      
      // GPT-3.5-turbo multiplier is 1.05
      expect(calculateModelTokens(prompt, 'gpt-3.5-turbo')).toBe(Math.ceil(baseTokens * 1.05));
      
      // GPT-4o-mini multiplier is 1.0 (no change)
      expect(calculateModelTokens(prompt, 'gpt-4o-mini')).toBe(baseTokens);
    });

    it('should handle empty prompts', () => {
      expect(calculateModelTokens('', 'gpt-4')).toBe(0);
      expect(calculateModelTokens('   ', 'gpt-4')).toBe(0);
    });
  });

  describe('getModelPrice', () => {
    it('should return correct prices for known models', () => {
      expect(getModelPrice('gpt-4')).toBe(0.03);
      expect(getModelPrice('gpt-4o-mini')).toBe(0.015);
      expect(getModelPrice('gpt-3.5-turbo')).toBe(0.007);
      expect(getModelPrice('gpt-4-turbo')).toBe(0.02);
    });

    it('should return default price for unknown models', () => {
      expect(getModelPrice('unknown-model')).toBe(0.01);
      expect(getModelPrice('')).toBe(0.01);
    });
  });

  describe('estimateCost', () => {
    it('should calculate correct cost for known models', () => {
      const prompt = 'Hello world'; // 2 tokens
      const result = estimateCost(prompt, 'gpt-4');
      
      expect(result.tokens).toBe(3); // 2 * 1.1 = 2.2, rounded up to 3
      expect(result.cost).toBeCloseTo((3 / 1000) * 0.03, 6); // tokens * price per 1000
    });

    it('should use default price for unknown models', () => {
      const prompt = 'Hello world'; // 2 tokens
      const result = estimateCost(prompt, 'unknown-model');
      
      expect(result.tokens).toBe(2); // no multiplier for unknown model
      expect(result.cost).toBeCloseTo((2 / 1000) * 0.01, 6); // tokens * default price
    });

    it('should handle empty prompts', () => {
      const result = estimateCost('', 'gpt-4');
      expect(result.tokens).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('should round cost to 4 decimal places', () => {
      const prompt = 'This is a longer test prompt to get more precise cost calculation';
      const result = estimateCost(prompt, 'gpt-4');
      
      // Check that cost is rounded to 4 decimal places
      const roundedCost = Math.round(result.cost * 10000) / 10000;
      expect(result.cost).toBe(roundedCost);
    });

    it('should calculate cost correctly for different models', () => {
      const prompt = 'Hello world this is a test';
      
      const gpt4Result = estimateCost(prompt, 'gpt-4');
      const gpt4oMiniResult = estimateCost(prompt, 'gpt-4o-mini');
      const gpt35Result = estimateCost(prompt, 'gpt-3.5-turbo');
      
      // GPT-4 should be more expensive than GPT-4o-mini
      expect(gpt4Result.cost).toBeGreaterThan(gpt4oMiniResult.cost);
      
      // GPT-3.5-turbo should be cheapest
      expect(gpt35Result.cost).toBeLessThan(gpt4Result.cost);
      expect(gpt35Result.cost).toBeLessThan(gpt4oMiniResult.cost);
    });
  });

  describe('estimateTotalCost', () => {
    it('should calculate total cost including response tokens', () => {
      const promptTokens = 100;
      const responseTokens = 50;
      const totalTokens = promptTokens + responseTokens; // 150
      
      const cost = estimateTotalCost(promptTokens, responseTokens, 'gpt-4');
      const expectedCost = (totalTokens / 1000) * 0.03;
      
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should handle zero response tokens', () => {
      const promptTokens = 100;
      const responseTokens = 0;
      
      const cost = estimateTotalCost(promptTokens, responseTokens, 'gpt-4');
      const expectedCost = (promptTokens / 1000) * 0.03;
      
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should use default price for unknown models', () => {
      const promptTokens = 100;
      const responseTokens = 50;
      
      const cost = estimateTotalCost(promptTokens, responseTokens, 'unknown-model');
      const expectedCost = ((promptTokens + responseTokens) / 1000) * 0.01;
      
      expect(cost).toBeCloseTo(expectedCost, 6);
    });
  });

  describe('Integration tests', () => {
    it('should provide consistent results across multiple calls', () => {
      const prompt = 'This is a test prompt for consistency checking';
      const model = 'gpt-4';
      
      const result1 = estimateCost(prompt, model);
      const result2 = estimateCost(prompt, model);
      
      expect(result1).toEqual(result2);
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'word '.repeat(1000); // 1000 words
      const result = estimateCost(longPrompt, 'gpt-4');
      
      expect(result.tokens).toBeGreaterThan(1000);
      expect(result.cost).toBeGreaterThan(0);
      expect(result.cost).toBeLessThan(10); // Should be reasonable cost
    });
  });
});