import { Cache } from '../types';

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  savedCost: number;
  savedTokens: number;
  entriesCount: number;
  evictions: number;
}

export interface CacheOptions {
  namespace?: string;
  ttlMs?: number;
  maxEntries?: number;
  sensitiveProtection?: boolean;
}

export interface CacheAdapter extends Cache {
  getMetrics(): CacheMetrics;
  invalidatePattern?(pattern: string): Promise<number>;
  invalidateNamespace?(namespace: string): Promise<number>;
}

export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  flushdb?(): Promise<string>;
  ping?(): Promise<string>;
}
