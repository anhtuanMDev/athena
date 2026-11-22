import { ASSET_VERSION, serveAsset } from "../asset-headers";

import { dataBranch, edgeCache, type ApiContext } from "./env";
import { STATUS, assertSafeFilePath } from "./http";

// GET assets/…: a picture of the data repo, served from this data center's cache (asset-headers.ts).

function rawHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "athena-admin" };
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return headers;
}

export async function handleGetAsset(context: ApiContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  // path is "assets/..."
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const githubPath = `public/${path}`;
  assertSafeFilePath(githubPath);
  if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return new Response("Server misconfigured", { status: STATUS.serverError });
  }
  const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${dataBranch(env)}/${githubPath}`;
  const version = url.searchParams.get("v") ?? "";
  const cache = edgeCache();
  try {
    return await serveAsset({
      path,
      // Anything but a payload's version is ignored, so it can't mint cache keys.
      version: ASSET_VERSION.test(version) ? version : undefined,
      ifNoneMatch: request.headers.get("If-None-Match"),
      cache: {
        match: (key) => cache.match(new Request(key)),
        put: (key, response) => cache.put(new Request(key), response),
      },
      fetchAsset: () => fetch(rawUrl, { headers: rawHeaders(env.GITHUB_TOKEN) }),
    });
  } catch {
    // Whatever went wrong serving it, the picture is a plain 500: its details aren't the viewer's.
  }
  return new Response("Internal error", { status: STATUS.serverError });
}
