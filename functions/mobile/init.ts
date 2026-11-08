import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { MOBILE_ASSETS_VERSION_KEY, MOBILE_INIT_VERSION_KEY, readCacheVersion } from "../../app/lib/mobile-cache-version";
import { activeGames, buildInitPayload, githubReader } from "../../app/lib/mobile-payload";
import { servePayload } from "../../app/lib/mobile-response";

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
  // Read through this data center's memo, so KV reads don't grow with players.
  const [version, assetsVersion] = await Promise.all([
    readCacheVersion(env.RATE_LIMIT_KV, cache, MOBILE_INIT_VERSION_KEY),
    readCacheVersion(env.RATE_LIMIT_KV, cache, MOBILE_ASSETS_VERSION_KEY),
  ]);
  // Every game's folders through GraphQL when the token allows: one GitHub request for them all.
  const reader = githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, env.GITHUB_BRANCH ?? "main", { token: env.GITHUB_TOKEN });
  // init_v4: screens and navigation replace layouts; the new name drops payloads cached in the old shape.
  return servePayload({
    cache,
    key: version === null || assetsVersion === null ? null : `${internalOrigin}/mobile/init_v4?v=${encodeURIComponent(version)}&a=${encodeURIComponent(assetsVersion)}`,
    unconfirmedKey: `${internalOrigin}/mobile/unconfirmed/init_v4`,
    lastGoodKey: `${internalOrigin}/mobile/last-good/init_v4`,
    build: () => buildInitPayload(reader),
    // A game turned off since the stored payload was built must not come back
    // with it. When games.json can't be read either, the list read last
    // decides, and with none the stored payload is the latest word there is.
    gamesAllowed: async (games) => {
      const active = await activeGames(cache, reader);
      return active === null || games.every((game) => active.includes(game));
    },
    waitUntil: context.waitUntil && ((promise) => context.waitUntil(promise)),
    label: "Mobile init API",
  });
}
