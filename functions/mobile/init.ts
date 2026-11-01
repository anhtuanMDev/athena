import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { MOBILE_INIT_VERSION_KEY, readCacheVersion } from "../../app/lib/mobile-cache-version";
import { CACHE_CONTROL, githubReader, readJsonFile, readJsonFolder } from "../../app/lib/mobile-payload";

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
  const version = await readCacheVersion(env.RATE_LIMIT_KV, MOBILE_INIT_VERSION_KEY);
  // init_v4: screens and navigation replace layouts; the new name drops payloads cached in the old shape.
  const cacheKey = new Request(`${internalOrigin}/mobile/init_v4?v=${encodeURIComponent(version)}`);

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
    const reader = githubReader(octokit, owner, repo, branch);
    // 1. games.json; without it there is nothing to show.
    const games: any[] = JSON.parse(await reader.read("data/_meta/games.json")).games ?? [];

    // Filter out inactive games
    const activeGames = games.filter(g => g.active !== false);

    const schemas: Record<string, any[]> = {};
    const enums: Record<string, any[]> = {};
    const screens: Record<string, any[]> = {};
    const navigation: Record<string, unknown> = {};
    // Set when a file was left out, so this payload is only cached briefly.
    let partial = false;

    // 2. Schemas, enums, screens and navigation of each active game. A missing
    // folder is empty; a file that can't be read is left out on its own.
    await Promise.all(activeGames.map(async (game) => {
      const gameId = game.slug || game.id;
      const [schemaFiles, enumFiles, screenFiles, navFile] = await Promise.all([
        readJsonFolder(reader, `data/${gameId}/schemas`),
        readJsonFolder(reader, `data/${gameId}/enums`),
        readJsonFolder(reader, `data/${gameId}/screens`),
        // No navigation file: the app shows a single Home tab
        readJsonFile(reader, `data/${gameId}/navigation.json`),
      ]);
      schemas[gameId] = schemaFiles.files.map((f) => f.content);
      enums[gameId] = enumFiles.files.map((f) => f.content);
      // Screen files are named by their id ("home", "hero-detail") and don't
      // store it, so the app gets it from the name.
      screens[gameId] = screenFiles.files.map((f) => ({ ...(f.content as object), id: f.name }));
      navigation[gameId] = navFile.content;
      partial ||= schemaFiles.partial || enumFiles.partial || screenFiles.partial || navFile.partial;
    }));

    const responseData = {
      games: activeGames,
      schemas,
      enums,
      screens,
      navigation,
      // App builds from before screens require this key; layouts are no longer served.
      layouts: {},
    };

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
