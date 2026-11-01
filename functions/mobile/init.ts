import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, readCacheVersion } from "../../app/lib/mobile-cache-version";
import { CACHE_CONTROL, buildInitPayload, githubReader } from "../../app/lib/mobile-payload";

export interface Env {
  RATE_LIMIT_KV?: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function onRequest(context: any): Promise<Response> {
  const { env, request } = context;
  const cache = (caches as any).default;
  const internalOrigin = "https://api.internal";
  const [version, assetsVersion] = await Promise.all([
    readCacheVersion(env.RATE_LIMIT_KV, MOBILE_INIT_VERSION_KEY),
    readCacheVersion(env.RATE_LIMIT_KV, MOBILE_ASSETS_VERSION_KEY),
  ]);
  // init_v4: screens and navigation replace layouts; the new name drops payloads cached in the old shape.
  const cacheKey = new Request(`${internalOrigin}/mobile/init_v4?v=${encodeURIComponent(version)}&a=${encodeURIComponent(assetsVersion)}`);

  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: new Headers(cached.headers),
    });
    // Ensure the client doesn't cache it, only the worker
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    const { payload: responseData, partial } = await buildInitPayload(githubReader(octokit, owner, repo, branch));

    const cacheableResponse = json(responseData, 200, {
      "Cache-Control": partial ? CACHE_CONTROL.partial : CACHE_CONTROL.complete, // Cache for Workers Cache API
    });

    if (context.waitUntil) {
      context.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));
    } else {
      await cache.put(cacheKey, cacheableResponse.clone());
    }

    // Return to client without Edge caching, so we always hit the Workers Cache API
    // which allows our triggerCachePurge to actually work
    const clientResponse = new Response(cacheableResponse.body, {
      status: cacheableResponse.status,
      headers: new Headers(cacheableResponse.headers)
    });
    clientResponse.headers.set("Cache-Control", "no-store");

    return clientResponse;
  } catch (err: any) {
    console.error("Mobile init API error:", err);
    return json({ error: err.message }, 500);
  }
}
