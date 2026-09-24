import { CacheEntry } from '../types';
import { CacheAdapter, CacheMetrics, CacheOptions } from './types';

export class MemoryCache implements CacheAdapter {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs?: number;
  private readonly namespace: string;

  private hits = 0;
  private misses = 0;
  private savedCost = 0;
  private savedTokens = 0;
  private evictions = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.defaultTtlMs = options.ttlMs;
    this.namespace = options.namespace ?? 'toka';
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.getValidEntry(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    this.hits++;
    // Reinsert key to maintain LRU access ordering
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    if (effectiveTtl !== undefined && (!Number.isFinite(effectiveTtl) || effectiveTtl < 0)) {
      throw new Error('Cache TTL must be a non-negative finite number.');
    }

    // Enforce size limits & LRU eviction
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.cleanup();
      if (this.cache.size >= this.maxEntries) {
        // Evict oldest entry (first item in Map iterator)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
          this.evictions++;
        }
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: effectiveTtl === undefined ? null : Date.now() + effectiveTtl,
    });
  }

  async has(key: string): Promise<boolean> {
    return this.getValidEntry(key) !== null;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async invalidateNamespace(namespace: string): Promise<number> {
    let count = 0;
    const prefix = `${namespace}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix) || key.includes(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
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
      entriesCount: this.cache.size,
      evictions: this.evictions,
    };
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  keys(): string[] {
    this.cleanup();
    return [...this.cache.keys()];
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  private getValidEntry(key: string): CacheEntry<unknown> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }
}
