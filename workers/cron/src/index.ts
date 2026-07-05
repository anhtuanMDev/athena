export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
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
    console.log(`Cron triggered at ${new Date().toISOString()}`);

    // Offload the background task to ensure it completes
    ctx.waitUntil(handleScheduledTask(env));
  },

  /**
   * For local testing or manual triggers, you can expose a fetch handler.
   * Make sure to secure this with an API key if you deploy it!
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger" && request.method === "POST") {
      // NOTE: In production, add a secret header/query check here!
      ctx.waitUntil(handleScheduledTask(env));
      return new Response("Cron job triggered manually", { status: 200 });
    }
    return new Response("Athena Cron Worker running", { status: 200 });
  }
};

/**
 * Main logic for the automated patch fetching
 */
async function handleScheduledTask(env: Env): Promise<void> {
  const game = "marvel-rivals"; // Hardcoded for now, could loop over all games

  try {
    // 2. Fetch the Patch schema from GitHub via Content API
    const schemaFile = await getGitHubFile(env, `data/${game}/schemas/patch-default.json`);
    
    if (!schemaFile || !schemaFile.api_endpoint) {
      console.log("No API endpoint configured in the schema. Exiting.");
      return;
    }

    // 1. Fetch data from external API (using the configured endpoint)
    console.log(`Fetching latest patch data from ${schemaFile.api_endpoint}...`);
    // const response = await fetch(schemaFile.api_endpoint);
    // const patchData = await response.json();
    
    // 3. Compare with current latest patch to see if conditions are fulfilled
    const latestPatch = await getGitHubFile(env, `data/${game}/patches/latest.json`);
    
    // 4. Validate and construct the new patch object based on dynamic schema rules
    // ... logic mapping external API fields to Schema fields ...
    const newPatchData = {
      id: `patch-${Date.now()}`,
      name: "Auto-generated Patch",
      date: new Date().toISOString(),
      // dynamically mapped fields go here
    };

    // 5. If conditions are met (e.g., new patch detected), save it!
    const shouldSaveNewPatch = true; // Replace with actual condition check
    if (shouldSaveNewPatch) {
      console.log("New patch detected. Saving to GitHub...");
      await saveGitHubFile(
        env, 
        `data/${game}/patches/${newPatchData.id}.json`, 
        newPatchData, 
        `chore: auto-fetch new patch ${newPatchData.id}`
      );
      console.log("Successfully saved new patch!");
    } else {
      console.log("No new patch found. Exiting.");
    }
  } catch (error) {
    console.error("Cron Job Failed:", error);
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
