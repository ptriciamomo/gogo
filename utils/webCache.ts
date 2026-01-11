/**
 * WEB-only persistent caching utility
 * Uses localStorage/sessionStorage to cache data and improve load performance
 */

import { Platform } from 'react-native';

// Cache TTL: 5 minutes (300000ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Cache key prefixes
const CACHE_PREFIX = 'gogo_cache_';
const CACHE_TIMESTAMP_PREFIX = 'gogo_cache_ts_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached data if valid, otherwise return null
 */
export function getCachedData<T>(key: string): T | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;
    
    const cachedData = localStorage.getItem(cacheKey);
    const cachedTimestamp = localStorage.getItem(timestampKey);
    
    if (!cachedData || !cachedTimestamp) {
      if (__DEV__) console.log(`[CACHE] No cache found for: ${key}`);
      return null;
    }
    
    const timestamp = parseInt(cachedTimestamp, 10);
    const now = Date.now();
    const age = now - timestamp;
    
    // Check if cache is stale
    if (age > CACHE_TTL_MS) {
      if (__DEV__) console.log(`[CACHE] Cache expired for: ${key} (age: ${Math.round(age / 1000)}s)`);
      // Remove stale cache
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(timestampKey);
      return null;
    }
    
    const parsed = JSON.parse(cachedData) as T;
    if (__DEV__) console.log(`[CACHE] Loaded from cache: ${key} (age: ${Math.round(age / 1000)}s)`);
    return parsed;
  } catch (error) {
    if (__DEV__) console.warn(`[CACHE] Error reading cache for ${key}:`, error);
    return null;
  }
}

/**
 * Store data in cache
 */
export function setCachedData<T>(key: string, data: T): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(timestampKey, Date.now().toString());
    
    if (__DEV__) console.log(`[CACHE] Cached data for: ${key}`);
  } catch (error) {
    if (__DEV__) console.warn(`[CACHE] Error writing cache for ${key}:`, error);
    // If storage is full, try to clear old caches
    if (error instanceof DOMException && error.code === 22) {
      clearOldCaches();
    }
  }
}

/**
 * Invalidate cache for a specific key
 */
export function invalidateCache(key: string): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;
    
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(timestampKey);
    
    if (__DEV__) console.log(`[CACHE] Invalidated cache for: ${key}`);
  } catch (error) {
    if (__DEV__) console.warn(`[CACHE] Error invalidating cache for ${key}:`, error);
  }
}

/**
 * Clear all app caches (called on logout)
 */
export function clearAllCaches(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keysToRemove: string[] = [];
    
    // Find all cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIMESTAMP_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all cache keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (__DEV__) console.log(`[CACHE] Cleared ${keysToRemove.length / 2} cache entries`);
  } catch (error) {
    if (__DEV__) console.warn(`[CACHE] Error clearing caches:`, error);
  }
}

/**
 * Clear old/stale caches to free up storage
 */
function clearOldCaches(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    // Find all timestamp keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_TIMESTAMP_PREFIX)) {
        const timestamp = parseInt(localStorage.getItem(key) || '0', 10);
        if (now - timestamp > CACHE_TTL_MS) {
          // Extract the cache key name
          const cacheKeyName = key.replace(CACHE_TIMESTAMP_PREFIX, '');
          keysToRemove.push(`${CACHE_PREFIX}${cacheKeyName}`);
          keysToRemove.push(key);
        }
      }
    }
    
    // Remove stale cache keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (__DEV__ && keysToRemove.length > 0) {
      console.log(`[CACHE] Cleared ${keysToRemove.length / 2} stale cache entries`);
    }
  } catch (error) {
    if (__DEV__) console.warn(`[CACHE] Error clearing old caches:`, error);
  }
}

/**
 * Get cache age in seconds (for debugging)
 */
export function getCacheAge(key: string): number | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const timestampKey = `${CACHE_TIMESTAMP_PREFIX}${key}`;
    const cachedTimestamp = localStorage.getItem(timestampKey);
    
    if (!cachedTimestamp) return null;
    
    const timestamp = parseInt(cachedTimestamp, 10);
    const age = Date.now() - timestamp;
    return Math.round(age / 1000);
  } catch {
    return null;
  }
}

