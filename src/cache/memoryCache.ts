/**
 * In-Memory Cache implementation for Toka SDK
 * Provides simple caching with TTL (Time-To-Live) functionality
 */

/**
 * Cache entry interface to store value and expiration time
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null; // null means no expiration
}

/**
 * In-Memory Cache class using Map for storage
 * Supports TTL (Time-To-Live) for automatic expiration
 */
export class MemoryCache {
  private cache: Map<string, CacheEntry<any>>;

  /**
   * Initialize the memory cache
   */
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      // Remove expired entry
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Store a value in the cache with optional TTL
   * @param key The cache key
   * @param value The value to store
   * @param ttl Optional time-to-live in milliseconds (null for no expiration)
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = ttl != null ? Date.now() + ttl : null;
    
    const entry: CacheEntry<T> = {
      value,
      expiresAt
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists and is not expired
   * @param key The cache key
   * @returns true if key exists and is not expired, false otherwise
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      // Remove expired entry and return false
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   * @param key The cache key to delete
   * @returns true if the key was found and deleted, false otherwise
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache
   * @returns The number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (excluding expired entries)
   * @returns Array of cache keys
   */
  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt === null || now < entry.expiresAt) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Clean up expired entries manually
   * This is called automatically during get/has operations, but can be called manually for cleanup
   */
  cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}