import { TokaCacheUnavailableError } from '../errors';
import { CacheAdapter, CacheMetrics, RedisClientLike } from './types';

export interface RedisCacheOptions {
  client?: RedisClientLike;
  redisUrl?: string;
  namespace?: string;
  defaultTtlSeconds?: number;
}

export class RedisCache implements CacheAdapter {
  private readonly client?: RedisClientLike;
  private readonly namespace: string;
  private readonly defaultTtlSeconds?: number;

  private hits = 0;
  private misses = 0;
  private savedCost = 0;
  private savedTokens = 0;
  private evictions = 0;

  constructor(optionsOrUrl?: string | RedisCacheOptions) {
    if (typeof optionsOrUrl === 'string') {
      this.namespace = 'toka';
      // URL string passed without client instance
      this.client = undefined;
    } else if (optionsOrUrl && typeof optionsOrUrl === 'object') {
      this.client = optionsOrUrl.client;
      this.namespace = optionsOrUrl.namespace ?? 'toka';
      this.defaultTtlSeconds = optionsOrUrl.defaultTtlSeconds;
    } else {
      this.namespace = 'toka';
      this.client = undefined;
    }
  }

  private ensureClient(): RedisClientLike {
    if (!this.client) {
      throw new TokaCacheUnavailableError(
        'Redis cache support requires an active Redis client or connection.'
      );
    }
    return this.client;
  }

  private formatKey(key: string): string {
    return key.startsWith(`${this.namespace}:`) ? key : `${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.ensureClient();
    const raw = await client.get(this.formatKey(key));
    if (raw === null || raw === undefined) {
      this.misses++;
      return null;
    }
    this.hits++;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const client = this.ensureClient();
    const serialized = JSON.stringify(value);
    const ttlSeconds =
      ttlMs !== undefined
        ? Math.max(1, Math.ceil(ttlMs / 1000))
        : this.defaultTtlSeconds;

    const formattedKey = this.formatKey(key);
    if (ttlSeconds !== undefined) {
      await client.set(formattedKey, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(formattedKey, serialized);
    }
  }

  async has(key: string): Promise<boolean> {
    const client = this.ensureClient();
    const result = await client.get(this.formatKey(key));
    return result !== null && result !== undefined;
  }

  async delete(key: string): Promise<boolean> {
    const client = this.ensureClient();
    const deleted = await client.del(this.formatKey(key));
    return deleted > 0;
  }

  async clear(): Promise<void> {
    const client = this.ensureClient();
    if (client.flushdb) {
      await client.flushdb();
    } else {
      await this.invalidateNamespace(this.namespace);
    }
  }

  async invalidateNamespace(namespace: string): Promise<number> {
    const client = this.ensureClient();
    const pattern = `${namespace}:*`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return await client.del(keys);
    }
    return 0;
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const client = this.ensureClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return await client.del(keys);
    }
    return 0;
  }

  recordHit(savedCost = 0, savedTokens = 0): void {
    this.savedCost = Number((this.savedCost + savedCost).toFixed(8));
    this.savedTokens += savedTokens;
  }

  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? Number((this.hits / total).toFixed(4)) : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      savedCost: Number(this.savedCost.toFixed(6)),
      savedTokens: this.savedTokens,
      entriesCount: 0,
      evictions: this.evictions,
    };
  }
}

export function createRedisCache(optionsOrUrl?: string | RedisCacheOptions): RedisCache {
  return new RedisCache(optionsOrUrl);
}
