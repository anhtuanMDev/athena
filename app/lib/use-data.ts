import { useState, useEffect, useEffectEvent } from "react";

import { INVALIDATED_EVENT, cachedData, forgetEntries, freshEntry, isInvalidated, loadOnce, storeEntry } from "./data-cache";

export function useData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKeyOverride?: string) {
  const key = `${cacheKeyOverride || 'useData-fallback'}-${JSON.stringify(deps)}`;

  const [data, setData] = useState<T | null>(() => cachedData(key) as T | null);
  const [isLoading, setLoading] = useState(() => freshEntry(key) === undefined);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const [prevKey, setPrevKey] = useState(key);

  if (key !== prevKey) {
    setPrevKey(key);
    setData(cachedData(key) as T | null);
    setLoading(freshEntry(key) === undefined);
    setError(null);
  }

  // The latest fetcher and data, for the effects below without re-running them.
  const load = useEffectEvent(async () => fetcher());
  const reloadOn = useEffectEvent((event: Event) => {
    if (!isInvalidated(key, (event as CustomEvent<unknown>).detail)) {
      return;
    }
    // Answers stay on screen while they load again; a page without one shows it's loading.
    if (data === null) {
      setLoading(true);
    }
    setError(null);
    setTick((count) => count + 1);
  });

  // Loads the key unless its answer is fresh: one request for every page that asks meanwhile.
  useEffect(() => {
    if (freshEntry(key) !== undefined) {
      return undefined;
    }
    let isCancelled = false;
    loadOnce(key, async () => load())
      .then((answer) => {
        if (!isCancelled) {
          setData(answer);
          storeEntry(key, answer);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setError(reason);
          setLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [key, tick]);

  useEffect(() => {
    const listener = (event: Event) => {
      reloadOn(event);
    };
    window.addEventListener(INVALIDATED_EVENT, listener);
    return () => {
      window.removeEventListener(INVALIDATED_EVENT, listener);
    };
  }, []);

  return { data, loading: isLoading, error };
}

export function clearDataCache(keyPrefix?: string) {
  forgetEntries(keyPrefix);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INVALIDATED_EVENT, { detail: { keyPrefix } }));
  }
}
