/**
 * Unit tests for the caching functionality
 */

import { MemoryCache } from '../src/cache/memoryCache';
import { RedisCache } from '../src/cache/redisCache';
import { Toka } from '../src/index';
import { createSampleConfig } from '../src/config';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  describe('set and get', () => {
    it('should store and retrieve values correctly', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 42);
      cache.set('key3', { name: 'test', value: 123 });

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe(42);
      expect(cache.get('key3')).toEqual({ name: 'test', value: 123 });
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should return null for expired keys', (done) => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      
      setTimeout(() => {
        expect(cache.get('key1')).toBeNull();
        done();
      }, 150);
    });

    it('should not expire keys with no TTL', (done) => {
      cache.set('key1', 'value1'); // No TTL
      
      setTimeout(() => {
        expect(cache.get('key1')).toBe('value1');
        done();
      }, 100);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired keys', (done) => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      
      setTimeout(() => {
        expect(cache.has('key1')).toBe(false);
        done();
      }, 150);
    });

    it('should return true for non-expired keys', (done) => {
      cache.set('key1', 'value1', 200); // 200ms TTL
      
      setTimeout(() => {
        expect(cache.has('key1')).toBe(true);
        done();
      }, 100);
    });
  });

  describe('delete', () => {
    it('should delete existing keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false for non-existent keys', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    it('should not count expired entries in size', (done) => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2');
      
      expect(cache.size()).toBe(2);
      
      setTimeout(() => {
        expect(cache.size()).toBe(1);
        done();
      }, 150);
    });
  });

  describe('keys', () => {
    it('should return all valid keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should not include expired keys', (done) => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2');
      cache.set('key3', 'value3', 50);

      setTimeout(() => {
        const keys = cache.keys();
        expect(keys).toHaveLength(1);
        expect(keys).toContain('key2');
        expect(keys).not.toContain('key1');
        expect(keys).not.toContain('key3');
        done();
      }, 75);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', (done) => {
      cache.set('key1', 'value1', 50);
      cache.set('key2', 'value2', 100);
      cache.set('key3', 'value3');

      setTimeout(() => {
        expect(cache.size()).toBe(3); // Should still be 3 before cleanup
        
        cache.cleanup();
        expect(cache.size()).toBe(1); // Only key3 should remain
        expect(cache.get('key1')).toBeNull();
        expect(cache.get('key2')).toBeNull();
        expect(cache.get('key3')).toBe('value3');
        done();
      }, 75);
    });
  });
});

describe('RedisCache', () => {
  let redisCache: RedisCache;

  beforeEach(() => {
    redisCache = new RedisCache();
  });

  describe('placeholder implementation', () => {
    it('should be instantiable', () => {
      expect(redisCache).toBeInstanceOf(RedisCache);
    });

    it('should return null for get operations', async () => {
      const result = await redisCache.get('test-key');
      expect(result).toBeNull();
    });

    it('should not throw for set operations', async () => {
      await expect(redisCache.set('test-key', 'test-value')).resolves.toBeUndefined();
    });

    it('should return false for has operations', async () => {
      const result = await redisCache.has('test-key');
      expect(result).toBe(false);
    });

    it('should return false for delete operations', async () => {
      const result = await redisCache.delete('test-key');
      expect(result).toBe(false);
    });
  });
});

describe('Toka with Caching', () => {
  let toka: Toka;
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    const config = createSampleConfig();
    toka = new Toka(config, cache);
  });

  describe('cache integration', () => {
    it('should return cached response on second call', async () => {
      const model = 'gpt-4';
      const prompt = 'Hello, world!';

      // First call should make API request
      const response1 = await toka.request(model, prompt);
      expect(response1.cacheHit).toBe(false);
      expect(response1.text).toBeDefined();
      expect(response1.tokens).toBeDefined();
      expect(response1.cost).toBeDefined();

      // Second call should return cached response
      const response2 = await toka.request(model, prompt);
      expect(response2.cacheHit).toBe(true);
      expect(response2.text).toBe(response1.text);
      expect(response2.tokens).toBe(response1.tokens);
      expect(response2.cost).toBe(response1.cost);
    });

    it('should use different cache keys for different prompts', async () => {
      const model = 'gpt-4';
      const prompt1 = 'Hello, world!';
      const prompt2 = 'How are you today?';

      const response1 = await toka.request(model, prompt1);
      const response2 = await toka.request(model, prompt2);

      expect(response1.cacheHit).toBe(false);
      expect(response2.cacheHit).toBe(false);
      expect(response1.text).not.toBe(response2.text);
    });

    it('should use different cache keys for different models', async () => {
      const model1 = 'gpt-4';
      const model2 = 'gpt-3.5-turbo';
      const prompt = 'Hello, world!';

      const response1 = await toka.request(model1, prompt);
      const response2 = await toka.request(model2, prompt);

      expect(response1.cacheHit).toBe(false);
      expect(response2.cacheHit).toBe(false);
      expect(response1.text).not.toBe(response2.text);
    });

    it('should use different cache keys for different options', async () => {
      const model = 'gpt-4';
      const prompt = 'Hello, world!';
      const options1 = { temperature: 0.5 };
      const options2 = { temperature: 0.8 };

      const response1 = await toka.request(model, prompt, options1);
      const response2 = await toka.request(model, prompt, options2);

      expect(response1.cacheHit).toBe(false);
      expect(response2.cacheHit).toBe(false);
      expect(response1.text).not.toBe(response2.text);
    });

    it('should respect TTL and return cache miss after expiration', async (done) => {
      const config = createSampleConfig();
      config.cacheTTL = 100; // 100ms TTL
      const tokaWithTTL = new Toka(config, cache);

      const model = 'gpt-4';
      const prompt = 'Hello, world!';

      // First call
      const response1 = await tokaWithTTL.request(model, prompt);
      expect(response1.cacheHit).toBe(false);

      // Second call should be cached
      const response2 = await tokaWithTTL.request(model, prompt);
      expect(response2.cacheHit).toBe(true);

      // Wait for TTL to expire
      setTimeout(async () => {
        const response3 = await tokaWithTTL.request(model, prompt);
        expect(response3.cacheHit).toBe(false);
        done();
      }, 150);
    });

    it('should work without cache when no cache is provided', async () => {
      const config = createSampleConfig();
      const tokaWithoutCache = new Toka(config); // No cache

      const model = 'gpt-4';
      const prompt = 'Hello, world!';

      const response1 = await tokaWithoutCache.request(model, prompt);
      const response2 = await tokaWithoutCache.request(model, prompt);

      expect(response1.cacheHit).toBe(false);
      expect(response2.cacheHit).toBe(false);
      expect(response1.text).toBeDefined();
      expect(response2.text).toBeDefined();
    });
  });
});