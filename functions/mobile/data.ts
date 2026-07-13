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
  const url = new URL(request.url);
  const game = url.searchParams.get("game");
  const entity = url.searchParams.get("entity");

  if (!game || !entity) {
    return json({ error: "game and entity parameters are required" }, 400);
  }

  const cache = (caches as any).default;
  const internalOrigin = "https://api.internal";
  const cacheKey = new Request(`${internalOrigin}/mobile/data?game=${game}&entity=${entity}`);

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
    const { data: directory } = await octokit.repos.getContent({
      owner,
      repo,
      path: `data/${game}/${entity}`,
      ref: branch,
    });

    if (Array.isArray(directory)) {
      const files = directory.filter(entry => entry.type === "file" && entry.name.endsWith(".json"));
      const chunkResults = await Promise.all(files.map(async (entry) => {
        try {
          const fileReq = await octokit.repos.getContent({ owner, repo, path: entry.path, ref: branch });
          if (!Array.isArray(fileReq.data) && fileReq.data.type === "file" && "content" in fileReq.data) {
            return JSON.parse(atob(fileReq.data.content));
          }
        } catch (e) {
          // ignore individual file errors
        }
        return null;
      }));
      
      const payload = chunkResults.filter(Boolean);
      const cacheableResponse = json(payload, 200, {
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000"
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
    }
    return json([]);
  } catch (err: any) {
    if (err.status === 404) {
      return json([]); // Return empty array if directory doesn't exist
    }
    console.error("Mobile data API error:", err);
    return json({ error: err.message }, 500);
  }
}
