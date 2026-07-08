/**
 * Hero Shooter Info API - Cloudflare Worker
 *
 * Routes:
 *   GET /api/games
 *   GET /api/:game/schema
 *   GET /api/:game/heroes            -> lightweight list
 *   GET /api/:game/heroes/:id        -> full hero detail
 *   GET /api/:game/patches           -> list of patch filenames (sorted, newest first)
 *   GET /api/:game/patches/:patch    -> single patch changelog
 *   GET /api/:game/patches?latest=true -> most recent patch only
 *
 * Data source: raw.githubusercontent.com/<GITHUB_OWNER>/<GITHUB_REPO>/<BRANCH>/data/...
 * Set GITHUB_OWNER, GITHUB_REPO, BRANCH as Worker environment variables (or edit the
 * constants below directly if you're not using wrangler vars).
 */

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour - GitHub raw content changes rarely

function githubRawBase(env) {
  const owner = env.GITHUB_OWNER || "YOUR_ORG";
  const repo = env.GITHUB_REPO || "YOUR_REPO";
  const branch = env.BRANCH || "main";
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
}

function errorResponse(message, status = 404) {
  return jsonResponse({ error: message }, status);
}

// Fetch a JSON file from GitHub raw, using the Cloudflare edge cache.
async function fetchGithubJson(path, env, ctx) {
  const url = `${githubRawBase(env)}/${path}`;
  const cache = caches.default;
  const cacheKey = new Request(url);

  let response = await cache.match(cacheKey);
  if (response) return response.json();

  const upstream = await fetch(url, {
    headers: { "User-Agent": "hero-shooter-info-api" },
  });

  if (!upstream.ok) {
    return null; // caller decides how to translate this into an HTTP error
  }

  const cloned = upstream.clone();
  const cacheableResponse = new Response(cloned.body, {
    headers: {
      "content-type": "application/json",
      "cache-control": `max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheableResponse));

  return upstream.json();
}

async function listGames(env, ctx) {
  const data = await fetchGithubJson("_meta/games.json", env, ctx);
  return data ? data.games : [];
}

async function isValidGame(gameSlug, env, ctx) {
  const games = await listGames(env, ctx);
  return games.some((g) => g.slug === gameSlug);
}

// GitHub API is used ONLY for directory listings (raw.githubusercontent.com has no
// "list files" endpoint). This hits api.github.com and is unauthenticated-rate-limited,
// so it is cached the same as everything else. If you outgrow the rate limit, add a
// GITHUB_TOKEN env var and pass it as an Authorization header here.
async function listDirectory(game, subpath, env, ctx) {
  const owner = env.GITHUB_OWNER || "YOUR_ORG";
  const repo = env.GITHUB_REPO || "YOUR_REPO";
  const branch = env.BRANCH || "main";
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/data/${game}/${subpath}?ref=${branch}`;

  const cache = caches.default;
  const cacheKey = new Request(url);
  let cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const headers = {
    "User-Agent": "hero-shooter-info-api",
    Accept: "application/vnd.github.v3+json",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const upstream = await fetch(url, { headers });
  if (!upstream.ok) return [];

  const listing = await upstream.json();
  const files = listing
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(".json", ""));

  const cacheableResponse = new Response(JSON.stringify(files), {
    headers: {
      "content-type": "application/json",
      "cache-control": `max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheableResponse));

  return files;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api", "overwatch", "heroes", "tracer"]

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    }

    if (parts[0] !== "api") {
      return errorResponse("Not found", 404);
    }

    if (parts.length === 2 && parts[1] === "purge" && request.method === "POST") {
      const secret = env.WORKER_PURGE_SECRET;
      if (secret && request.headers.get("Authorization") !== `Bearer ${secret}`) {
        return errorResponse("Unauthorized", 401);
      }
      const body = await request.json().catch(() => ({}));
      const purgePath = body.path;
      if (!purgePath) return errorResponse("path required", 400);

      const cache = caches.default;
      
      const pathWithoutData = purgePath.replace(/^data\//, "");
      
      // Purge the file url
      const fileUrl = `${githubRawBase(env)}/${pathWithoutData}`;
      await cache.delete(new Request(fileUrl));
      
      // Purge the directory listing url
      const pathParts = pathWithoutData.split('/');
      pathParts.pop();
      const dirPath = pathParts.join('/');
      if (dirPath) {
        const owner = env.GITHUB_OWNER || "YOUR_ORG";
        const repo = env.GITHUB_REPO || "YOUR_REPO";
        const branch = env.BRANCH || "main";
        const dirUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/${dirPath}?ref=${branch}`;
        await cache.delete(new Request(dirUrl));
      }
      
      return jsonResponse({ purged: true });
    }

    // GET /api/games
    if (parts.length === 2 && parts[1] === "games") {
      const games = await listGames(env, ctx);
      return jsonResponse(games);
    }

    if (parts.length < 2) return errorResponse("Not found", 404);

    const game = parts[1];
    const valid = await isValidGame(game, env, ctx);
    if (!valid) return errorResponse(`Unknown game: ${game}`, 404);

    // GET /api/:game/schema
    if (parts.length === 3 && parts[2] === "schema") {
      const data = await fetchGithubJson(`${game}/schema.json`, env, ctx);
      return data ? jsonResponse(data) : errorResponse("Schema not found");
    }

    // GET /api/:game/heroes  and  GET /api/:game/heroes/:id
    if (parts[2] === "heroes") {
      if (parts.length === 3) {
        const ids = await listDirectory(game, "heroes", env, ctx);
        const heroes = await Promise.all(
          ids.map((id) =>
            fetchGithubJson(`${game}/heroes/${id}.json`, env, ctx),
          ),
        );
        // Lightweight list view - trim the kit detail so the payload stays small
        const lightweight = heroes
          .filter(Boolean)
          .map(({ id, name, roles, difficulty, portrait, tags }) => ({
            id,
            name,
            roles,
            difficulty,
            portrait,
            tags,
          }));
        return jsonResponse(lightweight);
      }

      if (parts.length === 4) {
        const heroId = parts[3];
        const hero = await fetchGithubJson(
          `${game}/heroes/${heroId}.json`,
          env,
          ctx,
        );
        return hero
          ? jsonResponse(hero)
          : errorResponse(`Hero not found: ${heroId}`);
      }
    }

    // GET /api/:game/patches  and  GET /api/:game/patches/:patch
    if (parts[2] === "patches") {
      const patchIds = (await listDirectory(game, "patches", env, ctx))
        .sort()
        .reverse();

      if (parts.length === 3) {
        if (url.searchParams.get("latest") === "true") {
          if (patchIds.length === 0) return errorResponse("No patches found");
          const latest = await fetchGithubJson(
            `${game}/patches/${patchIds[0]}.json`,
            env,
            ctx,
          );
          return jsonResponse(latest);
        }
        return jsonResponse(patchIds);
      }

      if (parts.length === 4) {
        const patchId = parts[3];
        const patch = await fetchGithubJson(
          `${game}/patches/${patchId}.json`,
          env,
          ctx,
        );
        return patch
          ? jsonResponse(patch)
          : errorResponse(`Patch not found: ${patchId}`);
      }
    }

    // GET /api/:game/maps  (same lightweight-list pattern as heroes, add as needed)
    if (parts[2] === "maps" && parts.length === 3) {
      const ids = await listDirectory(game, "maps", env, ctx);
      const maps = await Promise.all(
        ids.map((id) => fetchGithubJson(`${game}/maps/${id}.json`, env, ctx)),
      );
      return jsonResponse(maps.filter(Boolean));
    }

    return errorResponse("Not found", 404);
  },
};
