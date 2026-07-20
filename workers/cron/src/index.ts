export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  CRON_SECRET: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
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
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(
      `Cron triggered by ${controller.cron} at ${new Date().toISOString()}`,
    );
    ctx.waitUntil(runScheduledJobs(env, controller.cron));
  },

  /**
   * For local testing or manual triggers, you can expose a fetch handler.
   * Make sure to secure this with an API key if you deploy it!
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger" && request.method === "POST") {
      const secret =
        request.headers.get("Authorization")?.replace("Bearer ", "") || "";
      if (!env.CRON_SECRET || !timingSafeEqual(secret, env.CRON_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const game = url.searchParams.get("game");
      const cronId = url.searchParams.get("job");

      ctx.waitUntil(runManualJobs(env, game, cronId));
      return new Response(`Triggered jobs manually`, { status: 200 });
    }
    return new Response("Athena Cron Worker running", { status: 200 });
  },
};

function getSemanticSchedule(cronExpr: string): string | null {
  switch (cronExpr) {
    case "0 * * * *":
      return "hourly";
    case "0 0 * * *":
      return "daily";
    case "0 0 * * 7":
      return "weekly";
    default:
      return null;
  }
}

async function runScheduledJobs(env: Env, schedule: string) {
  const semanticSchedule = getSemanticSchedule(schedule);
  if (!semanticSchedule) {
    console.error(
      `CRITICAL WARNING: Unmapped cron expression executed: ${schedule}. Please update getSemanticSchedule() in the worker code to support this schedule!`,
    );
    return;
  }

  const gamesFile = await getGitHubFile(env, "data/_meta/games.json");
  if (!gamesFile) return;
  const games = Array.isArray(gamesFile) ? gamesFile : gamesFile.games || [];

  for (const gameObj of games) {
    const game = typeof gameObj === "string" ? gameObj : gameObj.id;
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

async function runManualJobs(
  env: Env,
  targetGame: string | null,
  targetJobId: string | null,
) {
  const gamesFile = await getGitHubFile(env, "data/_meta/games.json");
  if (!gamesFile) return;
  const games = Array.isArray(gamesFile) ? gamesFile : gamesFile.games || [];

  for (const gameObj of games) {
    const game = typeof gameObj === "string" ? gameObj : gameObj.id;
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
      console.log(
        `Cron job ${job.id} has no api_endpoint configured. Exiting.`,
      );
      return;
    }

    if (!(await isSafeUrl(job.api_endpoint))) {
      console.error(
        `Cron job ${job.id} has an unsafe api_endpoint: ${job.api_endpoint}. Exiting to prevent SSRF.`,
      );
      return;
    }

    console.log(`Fetching latest data from ${job.api_endpoint}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    let response;
    try {
      response = await fetch(job.api_endpoint, {
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeoutId);
      throw new Error(
        `Redirects are not allowed for security reasons (SSRF protection).`,
      );
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

    let targetSchema: any = null;
    if (job.schema_id) {
      try {
        targetSchema = await getGitHubFile(
          env,
          `data/${game}/schemas/${job.schema_id}.json`,
        );
      } catch (e) {
        console.warn(`Could not load schema ${job.schema_id} for coercion`);
      }
    }

    let processedData = fetchedData;
    if (job.field_mappings && Object.keys(job.field_mappings).length > 0) {
      processedData = {};
      for (const [schemaKey, apiPath] of Object.entries(job.field_mappings)) {
        if (typeof apiPath === "string") {
          // Limit path traversal depth to 10
          const parts = apiPath.split(".");
          if (parts.length > 10)
            throw new Error("Field mapping path is too deep.");
          let value = parts.reduce((obj: any, key) => obj?.[key], fetchedData);

          if (targetSchema?.fields) {
            const fieldDef = targetSchema.fields.find(
              (f: any) => f.key === schemaKey,
            );
            if (fieldDef) {
              if (fieldDef.type === "number") {
                value = Number(value);
                if (isNaN(value)) value = 0;
              } else if (fieldDef.type === "string") {
                value =
                  value === null || value === undefined ? "" : String(value);
              } else if (fieldDef.type === "boolean") {
                value = Boolean(value);
              } else if (
                fieldDef.type === "list" ||
                fieldDef.type === "reference_list" ||
                fieldDef.type === "abilities" ||
                fieldDef.type === "weapon"
              ) {
                if (!Array.isArray(value)) value = [];
              }
            }
          }

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
      `chore: auto-fetch data for ${job.id}`,
    );
    console.log("Successfully saved new data!");
    
    if (job.notify_on_success) {
      console.log(`Triggering push notification for ${job.id}...`);
      try {
        await sendFirebasePush(env, job.notify_on_success);
        console.log("Push notification sent successfully!");
      } catch (pushErr) {
        console.error("Failed to send push notification:", pushErr);
      }
    }
  } catch (error: any) {
    console.error(`Cron Job ${job?.id} Failed:`, error);
    try {
      if (job?.id && game) {
        const errorData = {
          id: job.id,
          last_sync_attempt: new Date().toISOString(),
          last_error: sanitizeError(error),
        };
        await saveGitHubFile(
          env,
          `data/${game}/syncs/${job.id}.json`,
          errorData,
          `chore: log cron failure for ${job.id}`,
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
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker",
    },
  });

  if (!response.ok) return [];
  const entries: any[] = await response.json();
  const files = await Promise.all(
    entries
      .filter(
        (entry: any) => entry.type === "file" && entry.name.endsWith(".json"),
      )
      .map(async (entry: any) => await getGitHubFile(env, entry.path)),
  );

  return files.filter(Boolean);
}

function sanitizeError(error: any): string {
  if (!error) return "Unknown error";
  const msg = String(error.message || error);

  if (msg.includes("Redirects are not allowed"))
    return "Redirects are not allowed (SSRF protection).";

  const statusMatch = msg.match(/^API returned \d{3}/);
  if (statusMatch) return statusMatch[0];

  if (msg.includes("5MB")) return "Response exceeded 5MB size limit.";
  if (msg.includes("too deep")) return "Field mapping path is too deep.";
  if (error.name === "AbortError" || msg.includes("aborted"))
    return "API request timed out.";
  if (error.name === "SyntaxError" || msg.includes("JSON"))
    return "Failed to parse API response as JSON.";

  return "An unexpected error occurred during sync.";
}

async function isSafeUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;

    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(url.hostname) || url.hostname.includes(":")) {
      return false; // Direct IP fetch not allowed
    }

    if (
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Resolve via DoH to prevent DNS rebinding
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=A`,
      {
        headers: { Accept: "application/dns-json" },
      },
    );

    if (!response.ok) return false;
    const data: any = await response.json();
    if (data.Answer) {
      for (const record of data.Answer) {
        if (record.type === 1 && isInternalIP(record.data)) {
          return false;
        }
      }
    }

    const responseV6 = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=AAAA`,
      {
        headers: { Accept: "application/dns-json" },
      },
    );

    if (responseV6.ok) {
      const dataV6: any = await responseV6.json();
      if (dataV6.Answer) {
        for (const record of dataV6.Answer) {
          if (record.type === 28 && isInternalIPv6(record.data)) {
            return false;
          }
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isInternalIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0 || parts[0] === 169)
    return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isInternalIPv6(ip: string): boolean {
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  const ipLower = ip.toLowerCase();
  if (ipLower.startsWith("fc") || ipLower.startsWith("fd")) return true;
  if (
    ipLower.startsWith("fe8") ||
    ipLower.startsWith("fe9") ||
    ipLower.startsWith("fea") ||
    ipLower.startsWith("feb")
  )
    return true;
  if (ipLower.startsWith("::ffff:")) {
    const ipv4 = ipLower.split("::ffff:")[1];
    if (ipv4) return isInternalIP(ipv4);
  }
  return false;
}

// ============================================================================
// GitHub API Helpers (Lightweight versions of the ones in your main app)
// ============================================================================

async function getGitHubFile(env: Env, path: string): Promise<any | null> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker",
    },
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

async function saveGitHubFile(
  env: Env,
  path: string,
  contentObj: any,
  message: string,
): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

  const contentBase64 = encodeBase64(JSON.stringify(contentObj, null, 2));

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "Athena-Cron-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: env.GITHUB_BRANCH || "main",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save to GitHub: ${response.statusText}`);
  }
}

function encodeBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}

function decodeBase64(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(
        atob(str),
        (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2),
      )
      .join(""),
  );
}

// ============================================================================
// Firebase Cloud Messaging (FCM) HTTP v1 API Helpers
// ============================================================================

async function sendFirebasePush(env: Env, notifyConfig: any): Promise<void> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error("Missing FIREBASE credentials in worker environment variables.");
  }

  // 1. Generate JWT
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  const encodedSignature = encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsignedToken}.${encodedSignature}`;

  // 2. Exchange JWT for OAuth2 Access Token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to get Firebase access token: ${errText}`);
  }

  const { access_token } = (await tokenResponse.json()) as any;

  // 3. Send the FCM message
  const messageBody = {
    message: {
      topic: notifyConfig.topic || "all",
      notification: {
        title: notifyConfig.title || "Update",
        body: notifyConfig.body || "New data is available.",
      },
      data: notifyConfig.data || {},
    }
  };

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;
  const sendResponse = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messageBody)
  });

  if (!sendResponse.ok) {
    const errText = await sendResponse.text();
    throw new Error(`FCM API Error: ${errText}`);
  }
}

function encodeBase64Url(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string) {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  let pemContents = pem;
  // Handle literal \n if it was stored improperly in env
  pemContents = pemContents.replace(/\\n/g, "");
  pemContents = pemContents.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );
}
