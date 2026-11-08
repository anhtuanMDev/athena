import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { MOBILE_ASSETS_VERSION_KEY, mobileDataVersionKey, readCacheVersion } from "../../app/lib/mobile-cache-version";
import { activeGames, buildDataPayload, githubReader, servedFolders } from "../../app/lib/mobile-payload";
import { servePayload } from "../../app/lib/mobile-response";
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
  // And only configured categories of active games, checked before any KV
  // read, so made-up names can't make version reads or reach GitHub: each list
  // costs at most one GitHub read a minute in a data center (mobile-payload.ts).
  // The folder through GraphQL when the token allows: one GitHub request whatever it holds.
  const reader = githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH ?? "main", { token: env.GITHUB_TOKEN });
  const cache = (caches as any).default;
  const [folders, games] = await Promise.all([servedFolders(cache, reader), activeGames(cache, reader)]);
  if (!folders.includes(entity)) {
    return json({ error: `Invalid entity type: ${entity}` }, 400);
  }
  if (games === null) {
    return json({ error: "The list of games can't be read right now." }, 503, { "Retry-After": "60" });
  }
  if (!games.includes(game)) {
    return json({ error: `Unknown game: ${game}` }, 404);
  }

  const internalOrigin = "https://api.internal";
  // Read through this data center's memo, so KV reads don't grow with players.
  const [version, assetsVersion] = await Promise.all([
    readCacheVersion(env.RATE_LIMIT_KV, cache, mobileDataVersionKey(game, entity)),
    readCacheVersion(env.RATE_LIMIT_KV, cache, MOBILE_ASSETS_VERSION_KEY),
  ]);
  const payload = `game=${game}&entity=${entity}`;
  return servePayload({
    cache,
    key:
      version === null || assetsVersion === null
        ? null
        : `${internalOrigin}/mobile/data?${payload}&v=${encodeURIComponent(version)}&a=${encodeURIComponent(assetsVersion)}`,
    unconfirmedKey: `${internalOrigin}/mobile/unconfirmed/data?${payload}`,
    lastGoodKey: `${internalOrigin}/mobile/last-good/data?${payload}`,
    // A missing folder has no records; a file that can't be read is left out
    // on its own, and the list is then cached only briefly.
    build: () => buildDataPayload(reader, `data/${game}/${entity}`),
    waitUntil: context.waitUntil && ((promise) => context.waitUntil(promise)),
    label: "Mobile data API",
  });
}
