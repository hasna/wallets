interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function cached<T>(key: string, ttlMs: number, fn: () => T): T {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }
  const value = fn();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function cacheClear(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
