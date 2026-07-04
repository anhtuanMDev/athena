import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";

const globalCache = new Map<string, unknown>();
const MAX_CACHE_SIZE = 100;

export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKeyOverride?: string) {
  const key = cacheKeyOverride || (deps.length ? JSON.stringify(deps) + fetcher.toString() : null);
  
  const [data, setData] = useState<T | null>(() => {
    return key && globalCache.has(key) ? (globalCache.get(key) as T) : null;
  });
  const [loading, setLoading] = useState(!key || !globalCache.has(key));
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    
    if (!key || !globalCache.has(key)) {
      setLoading(true);
    }
    setError(null);

    fetcher()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          if (key) {
            globalCache.set(key, d);
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
