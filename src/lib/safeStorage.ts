/**
 * Safe localStorage wrapper that gracefully falls back to an in-memory dictionary
 * when localStorage is blocked, unavailable, or throws QuotaExceededError in restricted iframe environments.
 */
class SafeStorage {
  private memCache: Record<string, string> = {};

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (err) {
      console.warn(`[SafeStorage] Failed to getItem for key "${key}", using in-memory backup:`, err);
    }
    return this.memCache[key] || null;
  }

  private evictNonEssential(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;

    // Keys classified as non-essential (cache or notifications logs) that can be cleared safely
    const targetKeys = [
      'chat_app_users_cache',
      'aero_notifications',
      'aero_stories',
      'chat_app_stories_cache'
    ];

    let evictedAny = false;
    for (const key of targetKeys) {
      if (window.localStorage.getItem(key) !== null) {
        console.warn(`[SafeStorage] Quota exceeded. Evicting non-essential cache key: "${key}"`);
        window.localStorage.removeItem(key);
        delete this.memCache[key];
        evictedAny = true;
      }
    }

    // Also look for other keys containing 'cache' or '_cache' to evict dynamically
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.toLowerCase().includes('cache') || k.toLowerCase().includes('notification'))) {
          if (!targetKeys.includes(k)) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach(k => {
        console.warn(`[SafeStorage] Quota exceeded. Evicting dynamic cache key: "${k}"`);
        window.localStorage.removeItem(k);
        delete this.memCache[k];
        evictedAny = true;
      });
    } catch (e) {
      // Ignore key enumeration issues
    }

    return evictedAny;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch (innerErr: any) {
          // Detect local storage full / quota exceeded errors across standard browsers
          const isQuotaError = 
            innerErr.name === 'QuotaExceededError' || 
            innerErr.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
            innerErr.code === 22 || 
            innerErr.code === 1014;

          if (isQuotaError) {
            console.warn(`[SafeStorage] QuotaExceededError while saving key "${key}". Executing eviction cleanup...`);
            const cleaned = this.evictNonEssential();
            if (cleaned) {
              // Retry saving after clearing cache keys
              window.localStorage.setItem(key, value);
              return;
            }
          }
          throw innerErr; // Rethrow to gracefully fallback to memCache
        }
      }
    } catch (err) {
      console.warn(`[SafeStorage] Failed to setItem for key "${key}", using in-memory backup:`, err);
    }
    this.memCache[key] = value;
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (err) {
      console.warn(`[SafeStorage] Failed to removeItem for key "${key}", using in-memory backup:`, err);
    }
    delete this.memCache[key];
  }

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
        return;
      }
    } catch (err) {
      console.warn('[SafeStorage] Failed to clear localStorage, using in-memory backup:', err);
    }
    this.memCache = {};
  }
}

export const safeStorage = new SafeStorage();
