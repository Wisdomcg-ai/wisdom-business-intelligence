// src/lib/kpi/services/cache-service.ts

import { CacheEntry, CacheError } from '../types'
import { CACHE_CONFIG, FEATURE_FLAGS } from '../constants'

/**
 * CacheService - High-Performance In-Memory Caching
 * 
 * Provides intelligent caching for KPI data with automatic cleanup,
 * TTL management, and performance monitoring. Designed to handle
 * 280+ KPIs efficiently.
 * 
 * Features:
 * - TTL-based expiration
 * - Automatic cleanup
 * - Memory usage monitoring
 * - Pattern-based invalidation
 * - Performance metrics
 */
export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>()
  private hitCount = 0
  private missCount = 0
  private cleanupTimer: NodeJS.Timeout | null = null
  private maxSize: number
  private defaultTTL: number

  constructor(
    maxSize: number = CACHE_CONFIG.MAX_CACHE_SIZE,
    defaultTTL: number = CACHE_CONFIG.DEFAULT_TTL
  ) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
    
    // Start automatic cleanup if enabled
    if (FEATURE_FLAGS.ENABLE_CACHING) {
      this.startCleanupTimer()
    }
  }

  /**
   * Get item from cache
   * 
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    if (!FEATURE_FLAGS.ENABLE_CACHING) {
      return null
    }

    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        this.missCount++
        return null
      }

      // Check if expired
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        this.missCount++
        return null
      }

      this.hitCount++
      return entry.data as T
    } catch (error) {
      throw new CacheError(
        `Failed to get cache entry for key: ${key}`,
        { key, error: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  /**
   * Set item in cache with TTL
   * 
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!FEATURE_FLAGS.ENABLE_CACHING) {
      return
    }

    try {
      // Check if we need to make room
      if (this.cache.size >= this.maxSize) {
        this.evictOldest()
      }

      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttl ?? this.defaultTTL
      }

      this.cache.set(key, entry)
    } catch (error) {
      throw new CacheError(
        `Failed to set cache entry for key: ${key}`,
        { key, error: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  /**
   * Check if key exists and is not expired
   * 
   * @param key Cache key
   * @returns True if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    return entry !== undefined && !this.isExpired(entry)
  }

  /**
   * Delete specific key from cache
   * 
   * @param key Cache key to delete
   */
  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  /**
   * Invalidate cache entries by pattern
   * 
   * @param pattern Pattern to match keys (supports wildcards with *)
   */
  async invalidate(pattern: string): Promise<number> {
    try {
      let deletedCount = 0
      const regex = this.patternToRegex(pattern)

      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key)
          deletedCount++
        }
      }

      return deletedCount
    } catch (error) {
      throw new CacheError(
        `Failed to invalidate cache pattern: ${pattern}`,
        { pattern, error: error instanceof Error ? error.message : 'Unknown error' }
      )
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear()
    this.hitCount = 0
    this.missCount = 0
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.hitCount + this.missCount
    const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: hitRate.toFixed(2) + '%',
      memoryUsage: this.estimateMemoryUsage()
    }
  }

  /**
   * Generate smart cache key from type and parameters
   * 
   * @param type Cache entry type (e.g., 'kpi', 'search', 'recommendation')
   * @param params Parameters to include in key
   * @returns Generated cache key
   */
  generateKey(type: string, params: Record<string, any>): string {
    // Sort parameters for consistent keys
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${this.stringifyValue(params[key])}`)
      .join('|')

    return `${type}:${sortedParams}`
  }

  /**
   * Get or set pattern - retrieve from cache or compute and cache
   * 
   * @param key Cache key
   * @param compute Function to compute value if not cached
   * @param ttl Time to live (optional)
   * @returns Cached or computed value
   */
  async getOrSet<T>(
    key: string, 
    compute: () => Promise<T> | T,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Compute value
    const value = await compute()
    
    // Cache the computed value
    await this.set(key, value, ttl)
    
    return value
  }

  /**
   * Warm cache with frequently accessed data
   * 
   * @param entries Array of key-value pairs to preload
   */
  async warmUp<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    const promises = entries.map(({ key, value, ttl }) => 
      this.set(key, value, ttl)
    )
    
    await Promise.all(promises)
  }

  /**
   * Get cache entries by pattern
   * 
   * @param pattern Pattern to match keys
   * @returns Array of matching entries
   */
  getByPattern<T>(pattern: string): Array<{ key: string; value: T }> {
    const regex = this.patternToRegex(pattern)
    const results: Array<{ key: string; value: T }> = []

    for (const [key, entry] of this.cache.entries()) {
      if (regex.test(key) && !this.isExpired(entry)) {
        results.push({ key, value: entry.data as T })
      }
    }

    return results
  }

  // Private Methods

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl
  }

  /**
   * Evict oldest cache entry to make room
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired()
    }, CACHE_CONFIG.CLEANUP_INTERVAL)
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const keysToDelete: string[] = []

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key))
  }

  /**
   * Convert pattern with wildcards to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escapedPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      .replace(/\\\*/g, '.*') // Convert * to .*
    
    return new RegExp(`^${escapedPattern}$`)
  }

  /**
   * Stringify value for cache key generation
   */
  private stringifyValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null'
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    
    return String(value)
  }

  /**
   * Estimate memory usage of cache
   */
  private estimateMemoryUsage(): string {
    let totalSize = 0
    
    for (const entry of this.cache.values()) {
      // Rough estimation - each entry overhead + data size
      totalSize += JSON.stringify(entry).length * 2 // UTF-16 chars
    }
    
    const mb = totalSize / (1024 * 1024)
    return `${mb.toFixed(2)} MB`
  }

  /**
   * Cleanup on service destruction
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clear()
  }
}

/**
 * Singleton instance for global use
 */
let globalCacheInstance: CacheService | null = null

/**
 * Get global cache service instance
 */
export function getCacheService(): CacheService {
  if (!globalCacheInstance) {
    globalCacheInstance = new CacheService()
  }
  return globalCacheInstance
}

/**
 * Create new cache service instance
 */
export function createCacheService(
  maxSize?: number,
  defaultTTL?: number
): CacheService {
  return new CacheService(maxSize, defaultTTL)
}

/**
 * Cache decorator for methods
 * 
 * Usage:
 * @cache('user-kpis', 300000) // Cache for 5 minutes
 * async getUserKPIs(userId: string) { ... }
 */
export function cache(keyPrefix: string, ttl?: number) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value
    const cacheService = getCacheService()

    descriptor.value = async function (...args: any[]) {
      const key = cacheService.generateKey(keyPrefix, { args })
      
      return cacheService.getOrSet(
        key,
        () => method.apply(this, args),
        ttl
      )
    }
  }
}