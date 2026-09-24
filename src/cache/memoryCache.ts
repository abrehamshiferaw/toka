import { Cache, CacheEntry } from '../types';

export class MemoryCache implements Cache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.getValidEntry(key);
    return entry ? (entry.value as T) : null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs < 0)) {
      throw new Error('Cache TTL must be a non-negative finite number.');
    }
    this.cache.set(key, {
      value,
      expiresAt: ttlMs === undefined ? null : Date.now() + ttlMs,
    });
  }

  async has(key: string): Promise<boolean> {
    return this.getValidEntry(key) !== null;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
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
      if (entry.expiresAt !== null && now >= entry.expiresAt)
        this.cache.delete(key);
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
