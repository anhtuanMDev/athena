import { assetSeenKey } from "../asset-headers";
import { bumpCacheVersion, mobileVersionKeyForPath } from "../mobile-cache-version";

import { INTERNAL_ORIGIN, edgeCache, type ApiContext } from "./env";

/**
 * Pictures whose cached copies one write forgets in this data center: two
 * cache deletes each, of a Function's 50 subrequests (Workers Free). Any
 * others' expire on their own, within 5 minutes (asset-headers.ts); the app's
 * picture URLs carry their content hash, so only plain-path previews wait.
 */
const PURGED_PICTURES = 12;

const ASSETS = "public/assets/";

/** A purge's failure: logged, as the write it follows is done already. */
function reportPurgeFailure(error: unknown): void {
  console.error("Cache purge failed:", error);
}

/** The cache keys of the pictures written: the first PURGED_PICTURES of `paths`. */
function pictureKeys(paths: string[]): string[] {
  return paths
    .filter((path) => path.startsWith(ASSETS))
    .slice(0, PURGED_PICTURES)
    .flatMap((path) => {
      const encodedAssetPath = path.slice(ASSETS.length).split("/").map(encodeURIComponent).join("/");
      // And what this data center last saw of it (a 404, an older hash), so the
      // new picture shows here at once; elsewhere within a minute.
      return [`${INTERNAL_ORIGIN}/api/assets/${encodedAssetPath}`, assetSeenKey(`assets/${encodedAssetPath}`)];
    });
}

// After a write: forgets this data center's copies of the pictures written,
// the first PURGED_PICTURES of `paths` (so callers put replaced pictures
// first), and bumps the mobile cache version of each kind of path once, not
// per path: KV takes one write a second per key, and 1,000 a day.
export function purgePaths(context: Pick<ApiContext, "env" | "waitUntil">, paths: string[]): void {
  const cache = edgeCache();
  // Mobile payloads are cached in every data center, so they are invalidated by
  // bumping the version in their cache key rather than by cache.delete().
  // The webhook bumps it again for the same commit (about 40 writes a day),
  // kept as a safety net for when a delivery fails.
  const versionKeys = [...new Set(paths.map(mobileVersionKeyForPath).filter((key) => key !== null))];
  const promise = Promise.all([...pictureKeys(paths).map((key) => cache.delete(key)), ...versionKeys.map((key) => bumpCacheVersion(context.env.RATE_LIMIT_KV, key))]).catch(reportPurgeFailure);
  if (context.waitUntil) {
    context.waitUntil(promise);
  }
}

export function triggerCachePurge(context: Pick<ApiContext, "env" | "waitUntil">, path: string): void {
  purgePaths(context, [path]);
}
