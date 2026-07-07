import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";

const globalCache = new Map<string, { data: unknown; timestamp: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const inFlight = new Map<string, Promise<any>>();

export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKeyOverride?: string) {
  const key = cacheKeyOverride || (JSON.stringify(deps) + fetcher.toString());
  
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
  const [prevKey, setPrevKey] = useState(key);

  if (key !== prevKey) {
    setPrevKey(key);
    let initialData = null;
    let initialLoading = true;
    if (key && globalCache.has(key)) {
      const cached = globalCache.get(key)!;
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        initialData = cached.data as T;
        initialLoading = false;
      }
    }
    setData(initialData);
    setLoading(initialLoading);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    
    const isFresh = key && globalCache.has(key) && (Date.now() - globalCache.get(key)!.timestamp < CACHE_TTL_MS);
    
    if (!isFresh) {
      if (!data) setLoading(true);
      setError(null);

      let fetchPromise = inFlight.get(key);
      if (!fetchPromise) {
        fetchPromise = fetcher().finally(() => {
          inFlight.delete(key);
        });
        inFlight.set(key, fetchPromise);
      }

      fetchPromise
        .then((d: any) => {
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
        .catch((e: any) => {
          if (!cancelled) {
            setError(e);
            setLoading(false);
          }
        });
    }

    return () => { cancelled = true; };
  }, [...deps, tick]);

  useEffect(() => {
    const handleInvalidate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.keyPrefix || (key && key.startsWith(detail.keyPrefix))) {
        setTick((t) => t + 1);
      }
    };
    window.addEventListener("CACHE_INVALIDATED", handleInvalidate);
    return () => window.removeEventListener("CACHE_INVALIDATED", handleInvalidate);
  }, [key]);

  return { data, loading, error };
}

export function clearDataCache(keyPrefix?: string) {
  if (keyPrefix) {
    for (const k of globalCache.keys()) {
      if (k.startsWith(keyPrefix)) globalCache.delete(k);
    }
  } else {
    globalCache.clear();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("CACHE_INVALIDATED", { detail: { keyPrefix } }));
  }
}

export function useRedirect() {
  const navigate = useNavigate();
  return useCallback((to: string) => navigate(to), [navigate]);
}
