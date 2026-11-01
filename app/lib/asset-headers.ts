// Headers for files served from the data repo's public/assets (/api/assets/…).
// Their type comes from the file name, not from raw.githubusercontent.com, and
// they're sandboxed: an uploaded SVG opened directly can't run script or load
// anything on the admin's origin. Neither changes how an <img> shows them.

const TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function assetHeaders(path: string, cacheControl: string): Headers {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return new Headers({
    "Content-Type": TYPES[extension] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": cacheControl,
  });
}

/**
 * How long a picture may be kept. A URL carrying the content hash (?v=…, from
 * the mobile payloads) never changes, so it's kept for good, once the bytes are
 * checked against it. A plain path can be replaced by an upload at any time:
 * browsers check back each time (a cheap 304), and the edge keeps it briefly.
 */
export const ASSET_CACHE = {
  versioned: "public, max-age=31536000, immutable",
  edge: "public, max-age=300",
  revalidate: "no-cache",
  unavailable: "no-store",
};

/** raw.githubusercontent.com keeps a file for up to 5 minutes; ask again in one. */
const RETRY_AFTER_SECONDS = "60";

/** A ?v= value the mobile payloads write: the start of the file's git blob hash. */
export const ASSET_VERSION = /^[0-9a-f]{12}$/;

/** The git blob hash of `bytes`, the hash the repo tree lists for the file. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const data = new Uint8Array(header.length + bytes.length);
  data.set(header);
  data.set(bytes, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AssetCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

/**
 * A picture under public/assets: from the edge cache, else fetched by
 * `fetchAsset`. A versioned URL only ever answers 2xx with bytes that match
 * the version: the app keeps whatever such a URL returns for good, whatever
 * the headers say, so a stale file must fail instead and be asked for again.
 *
 * There's deliberately no second source on a mismatch. It only happens for a
 * few minutes after a picture is replaced (raw.githubusercontent.com can still
 * serve the old file), and the app shows its fallback art meanwhile. Asking
 * GitHub's API instead would let anyone spend the admin token's API quota, or
 * KV writes to cap that, on the Workers Free plan.
 */
export async function serveAsset({
  path,
  version,
  ifNoneMatch,
  cache,
  fetchAsset,
}: {
  /** "assets/…", as in the request URL. */
  path: string;
  /** A valid ?v= value, if the URL has one. */
  version?: string;
  ifNoneMatch: string | null;
  cache: AssetCache;
  fetchAsset: () => Promise<Response>;
}): Promise<Response> {
  const key = `https://api.internal/api/${path}${version ? `?v=${version}` : ""}`;
  const respond = (body: BodyInit | null, etag: string, cacheControl: string, status = 200) => {
    const headers = assetHeaders(path, cacheControl);
    headers.set("ETag", etag);
    return new Response(status === 304 ? null : body, { status, headers });
  };
  const unavailable = () =>
    new Response("Asset not available yet", {
      status: 503,
      headers: { "Retry-After": RETRY_AFTER_SECONDS, "Cache-Control": ASSET_CACHE.unavailable },
    });

  const cached = await cache.match(key);
  if (cached) {
    const etag = cached.headers.get("ETag") ?? "";
    if (version) return respond(cached.body, etag, ASSET_CACHE.versioned);
    return respond(cached.body, etag, ASSET_CACHE.revalidate, ifNoneMatch === etag ? 304 : 200);
  }

  const upstream = await fetchAsset();
  if (!upstream.ok) return new Response("Asset not found", { status: 404 });
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const sha = await gitBlobSha(bytes);
  const etag = `"${sha}"`;

  if (version) {
    if (!sha.startsWith(version)) return unavailable();
    await cache.put(key, respond(bytes, etag, ASSET_CACHE.versioned));
    return respond(bytes, etag, ASSET_CACHE.versioned);
  }
  await cache.put(key, respond(bytes, etag, ASSET_CACHE.edge));
  return respond(bytes, etag, ASSET_CACHE.revalidate, ifNoneMatch === etag ? 304 : 200);
}
