import { Octokit } from "@octokit/rest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { decodeUtf8Base64 } from "../../../app/lib/utf8-base64";
import { bumpCacheVersion } from "../../../app/lib/mobile-cache-version";
import { changedPaths, isPushTo, verifyGithubSignature, versionKeysToBump, type PushEvent } from "../../../app/lib/github-webhook";

// POST /api/webhooks/github — GitHub calls this after each push to the data
// repo and the mobile caches the pushed files feed are refreshed, as an admin
// save would. Set it up in the data repo under Settings → Webhooks: payload
// URL <site>/api/webhooks/github, content type application/json, the
// GITHUB_WEBHOOK_SECRET value as the secret, and "Just the push event".

export interface Env {
  RATE_LIMIT_KV?: KVNamespace;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH?: string;
  GITHUB_WEBHOOK_SECRET?: string;
}

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** Game slugs from games.json, for refreshing everything when a push doesn't list its files. */
async function listGameSlugs(env: Env, branch: string): Promise<string[]> {
  const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  const { data } = await octokit.repos.getContent({ owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, path: "data/_meta/games.json", ref: branch });
  if (!("content" in data)) return [];
  const games: unknown = JSON.parse(decodeUtf8Base64(data.content)).games;
  return Array.isArray(games) ? games.map((game) => game?.slug).filter((slug): slug is string => typeof slug === "string") : [];
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // Fail closed: without a secret anyone could make every data center refetch.
  if (!env.GITHUB_WEBHOOK_SECRET || !env.RATE_LIMIT_KV) return json({ error: "The webhook isn't configured." }, 503);
  // GitHub caps payloads at 25 MB; don't buffer anything bigger just to reject its signature.
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_PAYLOAD_BYTES) return json({ error: "Payload too large." }, 413);

  const body = await request.text();
  if (!(await verifyGithubSignature(body, request.headers.get("X-Hub-Signature-256"), env.GITHUB_WEBHOOK_SECRET))) {
    return json({ error: "Invalid signature." }, 401);
  }

  const event = request.headers.get("X-GitHub-Event");
  if (event === "ping") return json({ ok: true });
  if (event !== "push") return json({ ignored: `${event} events don't change data.` });

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Handled below with the other bodies that aren't a JSON object.
  }
  if (typeof parsed !== "object" || parsed === null) {
    return json({ error: "Set the webhook's content type to application/json." }, 400);
  }
  const push = parsed as PushEvent;
  const branch = env.GITHUB_BRANCH ?? "main";
  if (!isPushTo(push, env.GITHUB_OWNER, env.GITHUB_REPO, branch)) {
    return json({ ignored: `Only pushes to ${env.GITHUB_OWNER}/${env.GITHUB_REPO} ${branch} refresh the app.` });
  }

  const paths = changedPaths(push);
  let games: string[] = [];
  let gamesError: string | undefined;
  if (!paths) {
    try {
      games = await listGameSlugs(env, branch);
    } catch (err) {
      gamesError = err instanceof Error ? err.message : String(err);
    }
  }
  const keys = versionKeysToBump(paths, games);
  await Promise.all(keys.map((key) => bumpCacheVersion(env.RATE_LIMIT_KV, key)));
  // A failed delivery shows in GitHub's webhook log, where it can be redelivered.
  if (gamesError) return json({ refreshed: keys, error: `Couldn't read games.json: ${gamesError}` }, 502);
  return json({ refreshed: keys });
}
