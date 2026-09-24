import { MemoryCache } from '../src/cache/memoryCache';
import { RedisCache } from '../src/cache/redisCache';
import { createCacheKey } from '../src/security/cache-key';

describe('MemoryCache', () => {
  it('supports async get/set/has/delete/clear', async () => {
    const cache = new MemoryCache();
    await cache.set('key', { value: 1 });
    await expect(cache.get('key')).resolves.toEqual({ value: 1 });
    await expect(cache.has('key')).resolves.toBe(true);
    await cache.delete('key');
    await expect(cache.has('key')).resolves.toBe(false);
    await cache.set('other', 2);
    await cache.clear();
    await expect(cache.get('other')).resolves.toBeNull();
  });

  it('expires entries after TTL', async () => {
    const cache = new MemoryCache();
    await cache.set('key', 'value', 10);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(cache.get('key')).resolves.toBeNull();
  });
});

describe('RedisCache', () => {
  it('is explicitly unavailable rather than a fake implementation', async () => {
    await expect(new RedisCache().get('key')).rejects.toMatchObject({
      code: 'CACHE_UNAVAILABLE',
    });
  });
});

describe('cache keys', () => {
  it('hash request content without embedding raw prompts', () => {
    const prompt = 'a unique private prompt';
    const key = createCacheKey({
      model: 'demo',
      messages: [{ role: 'user', content: prompt }],
    });
    expect(key).not.toContain(prompt);
    expect(key).toBe(
      createCacheKey({
        model: 'demo',
        messages: [{ role: 'user', content: prompt }],
      })
    );
  });
});
