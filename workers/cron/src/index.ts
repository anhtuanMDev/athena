export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  CRON_SECRET: string;
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
      const secret = request.headers.get("Authorization")?.replace("Bearer ", "") || url.searchParams.get("secret");
      if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
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

async function runScheduledJobs(env: Env, schedule: string) {
  const gamesFile = await getGitHubFile(env, "data/_meta/games.json");
  if (!gamesFile) return;
  const games = Array.isArray(gamesFile) ? gamesFile : (gamesFile.games || []);
  
  for (const gameObj of games) {
    const game = typeof gameObj === 'string' ? gameObj : gameObj.id;
    if (!game) continue;
    
    const cronJobs = await listGitHubDirectory(env, `data/${game}/cron_jobs`);
    for (const job of cronJobs) {
      if (job.schedule === schedule) {
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

    console.log(`Fetching latest data from ${job.api_endpoint}...`);
    // const response = await fetch(job.api_endpoint);
    // const fetchedData = await response.json();
    
    // ... Stub logic ...
    const shouldSaveNewData = false; // Replace with actual condition check
    if (shouldSaveNewData) {
      const newPatchData = {
        id: `patch-${Date.now()}`,
        name: "Auto-generated Patch",
        date: new Date().toISOString(),
      };
      console.log(`New data detected for ${job.id}. Saving to GitHub...`);
      await saveGitHubFile(
        env, 
        `data/${game}/patches/${newPatchData.id}.json`, 
        newPatchData, 
        `chore: auto-fetch new patch ${newPatchData.id}`
      );
      console.log("Successfully saved new data!");
    } else {
      console.log(`No new data found for job ${job.id}. Exiting.`);
    }
  } catch (error) {
    console.error(`Cron Job ${job?.id} Failed:`, error);
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
