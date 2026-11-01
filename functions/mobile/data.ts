import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { MOBILE_ASSETS_VERSION_KEY, mobileDataVersionKey, readCacheVersion } from "../../app/lib/mobile-cache-version";
import { CACHE_CONTROL, buildDataPayload, githubReader } from "../../app/lib/mobile-payload";
import { assertSafeEntityType, assertSafeGameSlug } from "../../app/lib/safe-path";

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
  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const entity = url.searchParams.get("entity");

  if (!game || !entity) {
    return json({ error: "game and entity parameters are required" }, 400);
  }
  // Only entity folders are public; this also keeps internal folders such as
  // cron_jobs out of reach and stops arbitrary values from minting cache keys.
  try {
    assertSafeGameSlug(game);
    assertSafeEntityType(entity);
  } catch (err) {
    if (err instanceof Response) return json({ error: await err.text() }, 400);
    throw err;
  }

  const cache = (caches as any).default;
  const internalOrigin = "https://api.internal";
  // Read through this data center's memo, so KV reads don't grow with players.
  const [version, assetsVersion] = await Promise.all([
    readCacheVersion(env.RATE_LIMIT_KV, cache, mobileDataVersionKey(game, entity)),
    readCacheVersion(env.RATE_LIMIT_KV, cache, MOBILE_ASSETS_VERSION_KEY),
  ]);
  const cacheKey = new Request(
    `${internalOrigin}/mobile/data?game=${game}&entity=${entity}&v=${encodeURIComponent(version)}&a=${encodeURIComponent(assetsVersion)}`,
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers: new Headers(cached.headers),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH ?? "main";

  try {
    // A missing folder has no records; a file that can't be read is left out
    // on its own, and the list is then cached only briefly.
    const { payload, partial } = await buildDataPayload(githubReader(octokit, owner, repo, branch), `data/${game}/${entity}`);
    const cacheableResponse = json(payload, 200, {
      "Cache-Control": partial ? CACHE_CONTROL.partial : CACHE_CONTROL.complete,
    });

    if (context.waitUntil) {
      context.waitUntil(cache.put(cacheKey, cacheableResponse.clone()));
    } else {
      await cache.put(cacheKey, cacheableResponse.clone());
    }

    const clientResponse = new Response(cacheableResponse.body, {
      status: cacheableResponse.status,
      headers: new Headers(cacheableResponse.headers)
    });
    clientResponse.headers.set("Cache-Control", "no-store");

    return clientResponse;
  } catch (err: any) {
    console.error("Mobile data API error:", err);
    return json({ error: err.message }, 500);
  }
}
