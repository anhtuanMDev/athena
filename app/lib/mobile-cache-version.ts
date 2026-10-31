import { ENTITY_TYPES } from "./safe-path";

// The Workers Cache API only keeps an entry in the data center that stored it,
// so cache.delete() during an admin save cannot reach copies cached elsewhere.
// Mobile cache keys carry a version kept in KV instead: bumping it makes every
// data center miss once and refetch from GitHub.

interface VersionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export const MOBILE_INIT_VERSION_KEY = "cache_version:mobile_init";

export function mobileDataVersionKey(game: string, entity: string): string {
  return `cache_version:mobile_data:${game}:${entity}`;
}

const ENTITY_FILE = /^data\/([^/]+)\/([^/]+)\/[^/]+\.json$/;

// Which mobile payload a saved or deleted repo path feeds, if any.
export function mobileVersionKeyForPath(path: string): string | null {
  if (path === "data/_meta/games.json" || path.includes("/schemas/") || path.includes("/enums/") || path.includes("/layouts/")) {
    return MOBILE_INIT_VERSION_KEY;
  }
  const match = ENTITY_FILE.exec(path);
  if (match && (ENTITY_TYPES as readonly string[]).includes(match[2])) {
    return mobileDataVersionKey(match[1], match[2]);
  }
  return null;
}

export async function readCacheVersion(kv: VersionStore | undefined, key: string): Promise<string> {
  if (!kv) return "0";
  try {
    return (await kv.get(key)) ?? "0";
  } catch (err) {
    console.error("Cache version read failed:", err);
    return "0";
  }
}

export async function bumpCacheVersion(kv: VersionStore | undefined, key: string): Promise<void> {
  if (!kv) return;
  await kv.put(key, Date.now().toString(36));
}
