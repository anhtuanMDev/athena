import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";

const globalCache = new Map<string, { data: unknown; timestamp: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKeyOverride?: string) {
  const key = cacheKeyOverride || (deps.length ? JSON.stringify(deps) + fetcher.toString() : null);
  
  const [data, setData] = useState<T | null>(() => {
    if (key && globalCache.has(key)) {
      const cached = globalCache.get(key)!;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data as T;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!key || !globalCache.has(key) || (Date.now() - globalCache.get(key)!.timestamp >= CACHE_TTL_MS));
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    
    const isFresh = key && globalCache.has(key) && (Date.now() - globalCache.get(key)!.timestamp < CACHE_TTL_MS);
    
    if (!isFresh) {
      if (!data) setLoading(true);
      setError(null);

      fetcher()
        .then((d) => {
          if (!cancelled) {
            setData(d);
            if (key) {
              globalCache.set(key, { data: d, timestamp: Date.now() });
              if (globalCache.size > MAX_CACHE_SIZE) {
                const firstKey = globalCache.keys().next().value;
                if (firstKey) globalCache.delete(firstKey);
              }
            }
            setLoading(false);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e);
            setLoading(false);
          }
        });
    }

    return () => { cancelled = true; };
  }, [...deps, tick]);

  useEffect(() => {
    const handleInvalidate = () => {
      setTick((t) => t + 1);
    };
    window.addEventListener("CACHE_INVALIDATED", handleInvalidate);
    return () => window.removeEventListener("CACHE_INVALIDATED", handleInvalidate);
  }, []);

  return { data, loading, error };
}

export function clearDataCache() {
  globalCache.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("CACHE_INVALIDATED"));
  }
}

export function useRedirect() {
  const navigate = useNavigate();
  return useCallback((to: string) => navigate(to), [navigate]);
}
