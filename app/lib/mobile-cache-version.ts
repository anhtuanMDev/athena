import { CATEGORIES_PATH, isCategoryFolderFormat } from "./categories";

// The Workers Cache API only keeps an entry in the data center that stored it,
// so cache.delete() during an admin save cannot reach copies cached elsewhere.
// Mobile cache keys carry a version kept in KV instead: bumping it makes every
// data center miss once and refetch from GitHub.
//
// Mobile requests read those versions through a memo in each data center's
// cache, so their KV reads are bounded by version keys × data centers × 1,440
// a day (one a minute), however many players there are. On the Workers Free
// plan (100,000 reads a day, account-wide) they then can't use up the reads
// that admin sessions need, which fail closed.

interface VersionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export const MOBILE_INIT_VERSION_KEY = "cache_version:mobile_init";
/**
 * Part of every mobile payload's cache key: payloads carry each picture's
 * content hash in its URL, so a new or replaced asset must rebuild them.
 */
export const MOBILE_ASSETS_VERSION_KEY = "cache_version:mobile_assets";

export function mobileDataVersionKey(game: string, entity: string): string {
  return `cache_version:mobile_data:${game}:${entity}`;
}

const ENTITY_FILE = /^data\/([^/]+)\/([^/]+)\/[^/]+\.json$/;

// Which mobile payload a saved or deleted repo path feeds, if any.
export function mobileVersionKeyForPath(path: string): string | null {
  if (path.startsWith("public/assets/")) return MOBILE_ASSETS_VERSION_KEY;
  if (
    path === "data/_meta/games.json" ||
    path === CATEGORIES_PATH ||
    path.includes("/schemas/") ||
    path.includes("/enums/") ||
    path.includes("/screens/") ||
    /^data\/[^/]+\/navigation\.json$/.test(path)
  ) {
    return MOBILE_INIT_VERSION_KEY;
  }
  const match = ENTITY_FILE.exec(path);
  // Any folder that may hold records, so this needs no config.
  if (match && isCategoryFolderFormat(match[2])) {
    return mobileDataVersionKey(match[1], match[2]);
  }
  return null;
}

/**
 * How long a data center reuses a version it read from KV. A KV write already
 * takes up to about 60 s to reach every data center; the memo adds at most
 * about 60 s more before a bump shows in the app.
 */
export const VERSION_MEMO_SECONDS = 60;

/** The part of the Workers Cache API (caches.default) the memo uses. */
interface MemoCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/**
 * A mobile payload's cache version: from this data center's memo, else from
 * KV. A failed KV read gives "0" and isn't kept, so the next request tries
 * again. Admin session versions don't go through a memo: signing out must
 * take effect at once.
 */
export async function readCacheVersion(kv: VersionStore | undefined, memo: MemoCache, key: string): Promise<string> {
  const memoKey = new Request(`https://api.internal/cache-version/${encodeURIComponent(key)}`);
  const kept = await memo.match(memoKey).catch(() => undefined);
  if (kept) return kept.text();
  if (!kv) return "0";
  let version: string;
  try {
    version = (await kv.get(key)) ?? "0";
  } catch (err) {
    console.error("Cache version read failed:", err);
    return "0";
  }
  const entry = new Response(version, { headers: { "Cache-Control": `max-age=${VERSION_MEMO_SECONDS}` } });
  await memo.put(memoKey, entry).catch((err) => console.error("Cache version memo failed:", err));
  return version;
}

export async function bumpCacheVersion(kv: VersionStore | undefined, key: string): Promise<void> {
  if (!kv) return;
  await kv.put(key, Date.now().toString(36));
}
