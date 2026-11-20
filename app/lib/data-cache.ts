// What useData (use-data.ts) has loaded, kept for a few minutes, and the loads
// still under way, so the pages that ask for one key share one request and
// one answer. Nothing here knows React: the hook keeps its own state.

/** How long a stored answer is used before it is loaded again: 5 minutes. */
export const CACHE_TTL_MS = 300_000;

/** Answers kept at most; past it, the one stored first goes. */
export const MAX_CACHE_SIZE = 100;

/** The window event clearDataCache sends, with `{ keyPrefix }`, so the pages showing those keys load again. */
export const INVALIDATED_EVENT = "CACHE_INVALIDATED";

interface Entry {
  data: unknown;
  storedAt: number;
}

const entries = new Map<string, Entry>();
const running = new Map<string, Promise<unknown>>();

/** The answer stored under `key` while it is fresh, or undefined. */
export function freshEntry(key: string, now = Date.now()): { data: unknown } | undefined {
  const entry = entries.get(key);
  if (entry === undefined || now - entry.storedAt >= CACHE_TTL_MS) {
    return undefined;
  }
  return { data: entry.data };
}

/** The fresh answer under `key`, or null when there is none: what a page starts with. */
export function cachedData(key: string, now = Date.now()): unknown {
  const entry = freshEntry(key, now);
  return entry === undefined ? null : entry.data;
}

/** Whether an INVALIDATED_EVENT's detail covers `key`: one without a prefix (or with "") covers every key. */
export function isInvalidated(key: string, detail: unknown): boolean {
  const prefix: unknown = typeof detail === "object" && detail !== null && "keyPrefix" in detail ? detail.keyPrefix : undefined;
  return typeof prefix !== "string" || prefix === "" || key.startsWith(prefix);
}

/**
 * Stores an answer. A key stored again keeps its place in the order, so the
 * one evicted is the key stored first, however recently it was refreshed.
 */
export function storeEntry(key: string, data: unknown, now = Date.now()): void {
  entries.set(key, { data, storedAt: now });
  if (entries.size <= MAX_CACHE_SIZE) {
    return;
  }
  const [oldest] = entries.keys();
  entries.delete(oldest);
}

/** `load()`, or the load of `key` already under way: one request for every page that asks meanwhile. */
export function loadOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const started = running.get(key);
  if (started !== undefined) {
    return started as Promise<T>;
  }
  const promise = load().finally(() => {
    running.delete(key);
  });
  running.set(key, promise);
  return promise;
}

/** Forgets the answers whose key starts with `keyPrefix`; with none (or ""), every answer. Loads under way go on. */
export function forgetEntries(keyPrefix?: string): void {
  if (keyPrefix === undefined || keyPrefix === "") {
    entries.clear();
    return;
  }
  for (const key of entries.keys()) {
    if (key.startsWith(keyPrefix)) {
      entries.delete(key);
    }
  }
}
