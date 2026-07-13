import { Octokit } from "@octokit/rest";

export interface Env {
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
  const cacheKey = new Request(`${internalOrigin}/mobile/init_v2`);

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
    // 1. Fetch games.json
    const { data: gamesData } = await octokit.repos.getContent({
      owner,
      repo,
      path: "data/_meta/games.json",
      ref: branch,
    });
    
    let games: any[] = [];
    if ("content" in (gamesData as any)) {
      const decoded = atob((gamesData as any).content.replace(/\n/g, ''));
      const parsed = JSON.parse(decoded);
      games = parsed.games ?? [];
    }
    
    // Filter out inactive games
    const activeGames = games.filter(g => g.active !== false);
    
    const schemas: Record<string, any[]> = {};
    const enums: Record<string, any[]> = {};
    const layouts: Record<string, any[]> = {};

    // 2. Fetch schemas, enums, and layouts for each active game
    await Promise.all(activeGames.map(async (game) => {
      const gameId = game.slug || game.id;
      schemas[gameId] = [];
      enums[gameId] = [];
      layouts[gameId] = [];
      
      try {
        // Fetch schemas directory
        const { data: schemaFiles } = await octokit.repos.getContent({
          owner, repo, path: `data/${gameId}/schemas`, ref: branch,
        });
        if (Array.isArray(schemaFiles)) {
          const files = schemaFiles.filter(entry => entry.type === "file" && entry.name.endsWith(".json"));
          const chunkResults = await Promise.all(files.map(async (entry) => {
            const fileReq = await octokit.repos.getContent({ owner, repo, path: entry.path, ref: branch });
            if (!Array.isArray(fileReq.data) && fileReq.data.type === "file" && "content" in fileReq.data) {
              return JSON.parse(atob(fileReq.data.content.replace(/\n/g, '')));
            }
            return null;
          }));
          schemas[gameId] = chunkResults.filter(Boolean);
        }
      } catch (e) {
        // Ignore if directory doesn't exist
      }
      
      try {
        // Fetch enums directory
        const { data: enumFiles } = await octokit.repos.getContent({
          owner, repo, path: `data/${gameId}/enums`, ref: branch,
        });
        if (Array.isArray(enumFiles)) {
          const files = enumFiles.filter(entry => entry.type === "file" && entry.name.endsWith(".json"));
          const chunkResults = await Promise.all(files.map(async (entry) => {
            const fileReq = await octokit.repos.getContent({ owner, repo, path: entry.path, ref: branch });
            if (!Array.isArray(fileReq.data) && fileReq.data.type === "file" && "content" in fileReq.data) {
              return JSON.parse(atob(fileReq.data.content.replace(/\n/g, '')));
            }
            return null;
          }));
          enums[gameId] = chunkResults.filter(Boolean);
        }
      } catch (e) {
        // Ignore if directory doesn't exist
      }

      try {
        // Fetch layouts directory
        const { data: layoutFiles } = await octokit.repos.getContent({
          owner, repo, path: `data/${gameId}/layouts`, ref: branch,
        });
        if (Array.isArray(layoutFiles)) {
          const files = layoutFiles.filter(entry => entry.type === "file" && entry.name.endsWith(".json"));
          const chunkResults = await Promise.all(files.map(async (entry) => {
            const fileReq = await octokit.repos.getContent({ owner, repo, path: entry.path, ref: branch });
            if (!Array.isArray(fileReq.data) && fileReq.data.type === "file" && "content" in fileReq.data) {
              return JSON.parse(atob(fileReq.data.content.replace(/\n/g, '')));
            }
            return null;
          }));
          layouts[gameId] = chunkResults.filter(Boolean);
        }
      } catch (e) {
        // Ignore if directory doesn't exist
      }
    }));

    const responseData = {
      games: activeGames,
      schemas,
      enums,
      layouts
    };

    const cacheableResponse = json(responseData, 200, {
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000" // Cache for Workers Cache API
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
