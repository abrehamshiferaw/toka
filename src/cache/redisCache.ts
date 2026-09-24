import { TokaCacheUnavailableError } from '../errors';
import { Cache } from '../types';

/**
 * Reserved adapter boundary for a future Redis implementation.
 * Redis support is intentionally unavailable in Phase 1; no Redis dependency or
 * network connection is created by this class.
 */
export class RedisCache implements Cache {
  constructor(redisUrl?: string) {
    void redisUrl;
  }

  private unavailable(): never {
    throw new TokaCacheUnavailableError();
  }

  async get<T>(_key: string): Promise<T | null> {
    void _key;
    return this.unavailable();
  }
  async set<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    void _key;
    void _value;
    void _ttlMs;
    return this.unavailable();
  }
  async has(_key: string): Promise<boolean> {
    void _key;
    return this.unavailable();
  }
  async delete(_key: string): Promise<void> {
    void _key;
    return this.unavailable();
  }
  async clear(): Promise<void> {
    return this.unavailable();
  }
}

export function createRedisCache(redisUrl?: string): RedisCache {
  return new RedisCache(redisUrl);
}
