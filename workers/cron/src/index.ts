/**
 * Runs import jobs (data/{game}/cron_jobs) on their schedules, and on demand
 * through POST /trigger. Each run fetches the job's source and adds drafts
 * for new items (app/lib/importer); a reviewer publishes them from the admin.
 */
import { githubRepo, type GitHubEnv } from "../../../app/lib/importer/repo";
import { normalizeJob, runImport } from "../../../app/lib/importer/run";

export interface Env extends GitHubEnv {
  CRON_SECRET: string;
}

// Cloudflare passes the trigger's own expression, as written in wrangler.toml.
const SCHEDULES: Record<string, string> = {
  "0 * * * *": "hourly",
  "0 0 * * *": "daily",
  "0 0 * * SUN": "weekly",
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  if (aBuf.length !== bBuf.length) return false;
  let result = 0;
  for (let i = 0; i < aBuf.length; i++) result |= aBuf[i] ^ bBuf[i];
  return result === 0;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const schedule = SCHEDULES[controller.cron];
    if (!schedule) {
      console.error(`Unmapped cron expression ${controller.cron}: add it to SCHEDULES.`);
      return;
    }
    ctx.waitUntil(runJobs(env, (job) => job.active !== false && job.schedule === schedule));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/trigger" && request.method === "POST") {
      const secret = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
      if (!env.CRON_SECRET || !timingSafeEqual(secret, env.CRON_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const game = url.searchParams.get("game");
      const jobId = url.searchParams.get("job");
      ctx.waitUntil(runJobs(env, (job, jobGame) => (!game || jobGame === game) && (!jobId || job.id === jobId)));
      return new Response("Triggered jobs manually", { status: 200 });
    }
    return new Response("Athena Cron Worker running", { status: 200 });
  },
};

type JobFilter = (job: ReturnType<typeof normalizeJob>, game: string) => boolean;

/** Every game's slug from data/_meta/games.json. */
function gameSlugs(file: unknown): string[] {
  const list = Array.isArray(file) ? file : (file as { games?: unknown[] } | null)?.games ?? [];
  return list
    .map((game) => (typeof game === "string" ? game : (game as { slug?: string; id?: string })?.slug ?? (game as { id?: string })?.id))
    .filter((slug): slug is string => typeof slug === "string");
}

async function runJobs(env: Env, wanted: JobFilter): Promise<void> {
  const repo = githubRepo(env);
  for (const game of gameSlugs(await repo.read("data/_meta/games.json"))) {
    for (const jobId of await repo.list(`data/${game}/cron_jobs`)) {
      try {
        const job = normalizeJob(await repo.read(`data/${game}/cron_jobs/${jobId}.json`));
        if (!wanted(job, game)) continue;
        const result = await runImport({ repo, game, jobId });
        console.log(`Import ${game}/${jobId}: ${result.added} new of ${result.found}`);
      } catch (err) {
        // runImport records the failure in the job's state; one bad job doesn't stop the rest.
        console.error(`Import ${game}/${jobId} failed:`, (err as Error).message);
      }
    }
  }
}
