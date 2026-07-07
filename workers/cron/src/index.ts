export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  CRON_SECRET: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}

export default {
  /**
   * This is triggered based on the cron schedule in wrangler.toml
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Cron triggered by ${controller.cron} at ${new Date().toISOString()}`);
    ctx.waitUntil(runScheduledJobs(env, controller.cron));
  },

  /**
   * For local testing or manual triggers, you can expose a fetch handler.
   * Make sure to secure this with an API key if you deploy it!
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger" && request.method === "POST") {
      const secret = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
      if (!env.CRON_SECRET || !timingSafeEqual(secret, env.CRON_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const game = url.searchParams.get("game");
      const cronId = url.searchParams.get("job");

      ctx.waitUntil(runManualJobs(env, game, cronId));
      return new Response(`Triggered jobs manually`, { status: 200 });
    }
    return new Response("Athena Cron Worker running", { status: 200 });
  }
};

function getSemanticSchedule(cronExpr: string): string | null {
  switch (cronExpr) {
    case "0 * * * *": return "hourly";
    case "0 0 * * *": return "daily";
    case "0 0 * * 0": return "weekly";
    default: return null;
  }
}

async function runScheduledJobs(env: Env, schedule: string) {
  const semanticSchedule = getSemanticSchedule(schedule);
  if (!semanticSchedule) {
    console.log(`Unmapped cron expression: ${schedule}`);
    return;
  }

  const gamesFile = await getGitHubFile(env, "data/_meta/games.json");
  if (!gamesFile) return;
  const games = Array.isArray(gamesFile) ? gamesFile : (gamesFile.games || []);
  
  for (const gameObj of games) {
    const game = typeof gameObj === 'string' ? gameObj : gameObj.id;
    if (!game) continue;
    
    const cronJobs = await listGitHubDirectory(env, `data/${game}/cron_jobs`);
    for (const job of cronJobs) {
      if (job.schedule === semanticSchedule) {
        console.log(`Running cron job ${job.id} for game ${game}`);
        await handleJobTask(env, game, job);
      }
    }
  }
}

async function runManualJobs(env: Env, targetGame: string | null, targetJobId: string | null) {
  const gamesFile = await getGitHubFile(env, "data/_meta/games.json");
  if (!gamesFile) return;
  const games = Array.isArray(gamesFile) ? gamesFile : (gamesFile.games || []);
  
  for (const gameObj of games) {
    const game = typeof gameObj === 'string' ? gameObj : gameObj.id;
    if (!game) continue;
    if (targetGame && game !== targetGame) continue;
    
    const cronJobs = await listGitHubDirectory(env, `data/${game}/cron_jobs`);
    for (const job of cronJobs) {
      if (targetJobId && job.id !== targetJobId) continue;
      console.log(`Manually running cron job ${job.id} for game ${game}`);
      await handleJobTask(env, game, job);
    }
  }
}

async function handleJobTask(env: Env, game: string, job: any): Promise<void> {
  try {
    if (!job.api_endpoint) {
      console.log(`Cron job ${job.id} has no api_endpoint configured. Exiting.`);
      return;
    }

    if (!isSafeUrl(job.api_endpoint)) {
      console.error(`Cron job ${job.id} has an unsafe api_endpoint: ${job.api_endpoint}. Exiting to prevent SSRF.`);
      return;
    }

    console.log(`Fetching latest data from ${job.api_endpoint}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    let response;
    try {
      response = await fetch(job.api_endpoint, {
        redirect: 'manual',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeoutId);
      throw new Error(`Redirects are not allowed for security reasons (SSRF protection).`);
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      throw new Error(`API returned ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
      clearTimeout(timeoutId);
      throw new Error("Response exceeds 5MB size limit.");
    }

    const text = await response.text();
    clearTimeout(timeoutId);

    if (text.length > 5 * 1024 * 1024) {
      throw new Error("Response body exceeds 5MB limit.");
    }

    const fetchedData = JSON.parse(text);
    
    let processedData = fetchedData;
    if (job.field_mappings && Object.keys(job.field_mappings).length > 0) {
      processedData = {};
      for (const [schemaKey, apiPath] of Object.entries(job.field_mappings)) {
        if (typeof apiPath === "string") {
          // Limit path traversal depth to 10
          const parts = apiPath.split('.');
          if (parts.length > 10) throw new Error("Field mapping path is too deep.");
          const value = parts.reduce((obj: any, key) => obj?.[key], fetchedData);
          processedData[schemaKey] = value;
        }
      }
    }

    const newSyncData = {
      id: job.id,
      last_sync: new Date().toISOString(),
      data: processedData,
    };
    
    console.log(`New data processed for ${job.id}. Saving to GitHub...`);
    await saveGitHubFile(
      env, 
      `data/${game}/syncs/${job.id}.json`, 
      newSyncData, 
      `chore: auto-fetch data for ${job.id}`
    );
    console.log("Successfully saved new data!");
  } catch (error: any) {
    console.error(`Cron Job ${job?.id} Failed:`, error);
    try {
      if (job?.id && game) {
        const errorData = {
          id: job.id,
          last_sync_attempt: new Date().toISOString(),
          last_error: error.message || String(error)
        };
        await saveGitHubFile(
          env, 
          `data/${game}/syncs/${job.id}.json`, 
          errorData, 
          `chore: log cron failure for ${job.id}`
        );
      }
    } catch (e) {
      console.error("Also failed to write error log to GitHub", e);
    }
  }
}

async function listGitHubDirectory(env: Env, path: string): Promise<any[]> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker"
    }
  });

  if (!response.ok) return [];
  const entries: any[] = await response.json();
  const files = await Promise.all(
    entries
      .filter((entry: any) => entry.type === "file" && entry.name.endsWith(".json"))
      .map(async (entry: any) => await getGitHubFile(env, entry.path))
  );
  
  return files.filter(Boolean);
}

function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;
    
    // SSRF protection: reject IP addresses (v4 and v6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(url.hostname) || url.hostname.includes(":")) {
      return false;
    }
    
    // Reject common internal hostnames
    if (url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// GitHub API Helpers (Lightweight versions of the ones in your main app)
// ============================================================================

async function getGitHubFile(env: Env, path: string): Promise<any | null> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker"
    }
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data: any = await response.json();
  const content = decodeBase64(data.content);
  
  try {
    return JSON.parse(content);
  } catch (e) {
    return content;
  }
}

async function saveGitHubFile(env: Env, path: string, contentObj: any, message: string): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  
  const contentBase64 = encodeBase64(JSON.stringify(contentObj, null, 2));

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: env.GITHUB_BRANCH || "main"
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to save to GitHub: ${response.statusText}`);
  }
}

function encodeBase64(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    (match, p1) => String.fromCharCode(parseInt(p1, 16))
  ));
}

function decodeBase64(str: string): string {
  return decodeURIComponent(Array.prototype.map.call(atob(str), (c) =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
}
