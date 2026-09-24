import {
  MemoryCache,
  RedisCache,
  createCacheKey,
  isSensitiveRequest,
  containsSensitiveData,
  Toka,
  MockProvider,
} from '../src';

describe('Phase 6: Production Caching & Sensitive Protection', () => {
  describe('Repository & Revision Aware Cache Keys', () => {
    it('produces identical keys for identical requests and commitSha', () => {
      const reqA = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'export function add(a, b) { return a + b; }' }],
        agentContext: {
          repository: 'my-org/my-repo',
          commitSha: 'commit-aaa-111',
        },
      };

      const reqB = {
        model: 'gpt-4o',
        messages: [{ role: 'user' as const, content: 'export function add(a, b) { return a + b; }' }],
        agentContext: {
          repository: 'my-org/my-repo',
          commitSha: 'commit-aaa-111',
        },
      };

      expect(createCacheKey(reqA)).toBe(createCacheKey(reqB));
      expect(createCacheKey(reqA)).toContain('my-org_my-repo');
      expect(createCacheKey(reqA)).toContain('commit-aaa-1');
    });

    it('produces different keys when commitSha changes (preventing stale code reuse)', () => {
      const prompt = 'analyze repository functions';
      const keyRev1 = createCacheKey({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        agentContext: { repository: 'my-org/repo', commitSha: '111111111111' },
      });

      const keyRev2 = createCacheKey({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        agentContext: { repository: 'my-org/repo', commitSha: '222222222222' },
      });

      expect(keyRev1).not.toBe(keyRev2);
    });
  });

  describe('Sensitive Content Protection', () => {
    it('detects sensitive API keys, tokens, and private keys in prompts', () => {
      expect(containsSensitiveData('Here is my key: sk-proj-12345678901234567890123456')).toBe(true);
      expect(containsSensitiveData('ghp_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
      expect(containsSensitiveData('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
      expect(containsSensitiveData('Normal safe coding prompt without secrets')).toBe(false);
    });

    it('identifies sensitive requests via metadata flag or content inspection', () => {
      expect(
        isSensitiveRequest({
          model: 'demo',
          messages: [{ role: 'user', content: 'Normal prompt' }],
          sensitive: true,
        })
      ).toBe(true);

      expect(
        isSensitiveRequest({
          model: 'demo',
          messages: [{ role: 'user', content: 'Please use key sk-123456789012345678901234567890' }],
        })
      ).toBe(true);

      expect(
        isSensitiveRequest({
          model: 'demo',
          messages: [{ role: 'user', content: 'Safe prompt' }],
        })
      ).toBe(false);
    });

    it('bypasses caching completely for sensitive requests', async () => {
      const cache = new MemoryCache();
      const toka = new Toka(
        { models: ['demo'], maxCostPerRequest: 1.0 },
        cache,
        new MockProvider()
      );

      const sensitiveRequest = {
        model: 'demo',
        messages: [{ role: 'user' as const, content: 'Deploy with secret sk-live-123456789012345678901234' }],
      };

      const res1 = await toka.complete(sensitiveRequest);
      expect(res1.cacheHit).toBe(false);

      // Second identical call MUST NOT hit cache because of sensitive data protection!
      const res2 = await toka.complete(sensitiveRequest);
      expect(res2.cacheHit).toBe(false);

      // Cache size should remain 0
      expect(cache.size()).toBe(0);
    });
  });

  describe('MemoryCache Advanced Features', () => {
    it('enforces maxEntries and evicts least recently accessed items', async () => {
      const cache = new MemoryCache({ maxEntries: 2 });
      await cache.set('k1', 'val1');
      await cache.set('k2', 'val2');

      // Access k1 to make it most recently used
      await cache.get('k1');

      // Insert k3 -> should evict k2
      await cache.set('k3', 'val3');

      expect(await cache.get('k1')).toBe('val1');
      expect(await cache.get('k2')).toBeNull(); // evicted!
      expect(await cache.get('k3')).toBe('val3');

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBeGreaterThanOrEqual(1);
    });

    it('tracks cache metrics (hits, misses, hitRate, savedCost)', async () => {
      const cache = new MemoryCache();
      await cache.set('item', 'data');

      await cache.get('item'); // hit
      await cache.get('missing'); // miss
      cache.recordHit(0.005, 500);

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRate).toBe(0.5);
      expect(metrics.savedCost).toBe(0.005);
      expect(metrics.savedTokens).toBe(500);
    });

    it('supports invalidation by pattern and namespace', async () => {
      const cache = new MemoryCache();
      await cache.set('toka:webapp:key1', 'v1');
      await cache.set('toka:webapp:key2', 'v2');
      await cache.set('toka:mobile:key3', 'v3');

      const removed = await cache.invalidatePattern('webapp');
      expect(removed).toBe(2);
      expect(await cache.get('toka:webapp:key1')).toBeNull();
      expect(await cache.get('toka:mobile:key3')).toBe('v3');
    });
  });

  describe('Production Redis Adapter', () => {
    it('works with a Redis client adapter when provided', async () => {
      const store = new Map<string, string>();
      const mockRedisClient = {
        async get(key: string) {
          return store.get(key) ?? null;
        },
        async set(key: string, value: string) {
          store.set(key, value);
          return 'OK';
        },
        async del(key: string | string[]) {
          const keys = Array.isArray(key) ? key : [key];
          let c = 0;
          for (const k of keys) {
            if (store.delete(k)) c++;
          }
          return c;
        },
        async keys(pattern: string) {
          return [...store.keys()];
        },
      };

      const redisCache = new RedisCache({ client: mockRedisClient, namespace: 'app' });
      await redisCache.set('user-prompt', { answer: 42 }, 60000);
      expect(await redisCache.get('user-prompt')).toEqual({ answer: 42 });
      expect(await redisCache.has('user-prompt')).toBe(true);

      const metrics = redisCache.getMetrics();
      expect(metrics.hits).toBe(1);
    });
  });
});
