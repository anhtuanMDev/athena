/**
 * Runs import jobs (data/{game}/cron_jobs) on their schedules, and on demand
 * through POST /trigger. Each run fetches the job's source and adds drafts
 * for new items (app/lib/importer); a reviewer publishes them from the admin.
 */
import { CATEGORIES_PATH } from "../../../app/lib/categories";
import { githubRepo, runRepo, type GitHubEnv, type RunRepo } from "../../../app/lib/importer/repo";
import { DEFERRED, deferImport, importCost, importPaths, normalizeJob, runImport, type ImportState } from "../../../app/lib/importer/run";

export interface Env extends GitHubEnv {
  CRON_SECRET: string;
}

// Cloudflare passes the trigger's own expression, as written in wrangler.toml.
const SCHEDULES: Record<string, string> = {
  "0 * * * *": "hourly",
  "0 0 * * *": "daily",
  "0 0 * * SUN": "weekly",
};

/** How often each schedule runs: consecutive runs of one get consecutive run numbers. */
const PERIOD_MS: Record<string, number> = { hourly: 3_600_000, daily: 86_400_000, weekly: 604_800_000 };

/** Subrequests an invocation may make on the Workers Free plan. */
const SUBREQUEST_LIMIT = 50;
/** Kept for the run's one commit (5 REST requests, importer/repo.ts) and its retry when the branch moved meanwhile. */
const COMMIT_RESERVE = 2 * 5;
const GAMES_PATH = "data/_meta/games.json";

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
    const run = Math.floor(controller.scheduledTime / PERIOD_MS[schedule]);
    ctx.waitUntil(runJobs(env, (job) => job.active !== false && job.schedule === schedule, run));
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
      ctx.waitUntil(runJobs(env, (job, jobGame) => (!game || jobGame === game) && (!jobId || job.id === jobId), Math.floor(Date.now() / 60_000)));
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

/** `items` from the `run`th (modulo their number) on: each run starts one further along. */
function rotated<T>(items: T[], run: number): T[] {
  const start = items.length === 0 ? 0 : ((run % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** Whether the last run left this job for later, as far as `repo` knows without a request. */
async function deferredLastRun(repo: RunRepo, game: string, jobId: string): Promise<boolean> {
  const state = `data/${game}/syncs/${jobId}.json`;
  if (repo.pending({ files: [state] }) > 0) return false;
  return (await repo.read<ImportState>(state).catch(() => null))?.last_error === DEFERRED;
}

/**
 * Runs the jobs `wanted` picks, within one invocation's subrequests (50 on the
 * Workers Free plan), which every fetch below counts against:
 *
 * - The run reads through GitHub GraphQL when the token allows (runRepo): the
 *   games and categories, then every game's jobs and schemas, then the due
 *   jobs' states and folders, a request each. A job then costs its source's 3
 *   requests (DNS and the fetch), and the run one commit for all of them.
 *   Through REST, each read is a request of its own, made once.
 * - A job runs only if its cost (importCost) fits what's left, keeping room for
 *   the commit and for recording the jobs after it. One that doesn't is
 *   deferred: its state says so (the admin shows it), and the log. Jobs left
 *   for later last time go first, then the rest from a place that moves along
 *   with each run, so it isn't always the same job that waits.
 * - One game's jobs failing to list or run never stops another's.
 */
async function runJobs(env: Env, wanted: JobFilter, run: number): Promise<void> {
  let used = 0;
  const counted: typeof fetch = (input, init) => {
    used++;
    return fetch(input, init);
  };
  const budget = SUBREQUEST_LIMIT - COMMIT_RESERVE;
  const repo = runRepo(githubRepo(env, counted));
  const now = new Date();

  await repo.prefetch({ files: [GAMES_PATH, CATEGORIES_PATH] });
  const games = gameSlugs(await repo.read(GAMES_PATH));
  await repo.prefetch({ folders: games.flatMap((game) => [`data/${game}/cron_jobs`, `data/${game}/schemas`]) });

  const due: { game: string; jobId: string; job: ReturnType<typeof normalizeJob> }[] = [];
  for (const game of games) {
    let jobIds: string[];
    try {
      jobIds = await repo.list(`data/${game}/cron_jobs`);
    } catch (err) {
      console.error(`Import jobs of ${game} couldn't be listed:`, (err as Error).message);
      continue;
    }
    for (const jobId of jobIds) {
      const path = `data/${game}/cron_jobs/${jobId}.json`;
      if (used + repo.pending({ files: [path] }) > budget) {
        console.error(`Import ${game}/${jobId} not read: subrequest budget`);
        continue;
      }
      try {
        const job = normalizeJob(await repo.read(path));
        if (wanted(job, game)) due.push({ game, jobId, job });
      } catch (err) {
        console.error(`Import ${game}/${jobId} failed:`, (err as Error).message);
      }
    }
  }
  if (due.length === 0) return;

  // Every due job's reads, in one request.
  const reads = await Promise.all(due.map(({ game, job }) => importPaths(repo, game, job)));
  await repo.prefetch({ files: reads.flatMap((r) => r.files), listings: reads.flatMap((r) => r.listings) });

  const order = rotated(due, run);
  const waited = await Promise.all(order.map(({ game, jobId }) => deferredLastRun(repo, game, jobId)));
  const queue = [...order.filter((_, i) => waited[i]), ...order.filter((_, i) => !waited[i])];
  const stateRead = ({ game, jobId }: (typeof due)[number]) => repo.pending({ files: [`data/${game}/syncs/${jobId}.json`] });

  for (const [i, { game, jobId, job }] of queue.entries()) {
    // Room to record each later job's deferral, which reads its state unless it's held.
    const reserve = queue.slice(i + 1).reduce((n, later) => n + stateRead(later), 0);
    if (used + (await importCost(repo, game, job)) + reserve > budget) {
      if (used + stateRead(queue[i]) > budget) {
        console.error(`Import ${game}/${jobId} deferred: subrequest budget; not recorded, no room left to read its state`);
        continue;
      }
      await deferImport(repo, game, jobId, now).catch((err) => console.error(`Import ${game}/${jobId}: deferral not recorded:`, (err as Error).message));
      console.warn(`Import ${game}/${jobId} deferred: subrequest budget (${used} of ${SUBREQUEST_LIMIT} used)`);
      continue;
    }
    try {
      const result = await runImport({ repo, game, jobId, fetcher: counted });
      console.log(`Import ${game}/${jobId}: ${result.added} new of ${result.found}`);
    } catch (err) {
      // runImport records the failure in the job's state; one bad job doesn't stop the rest.
      console.error(`Import ${game}/${jobId} failed:`, (err as Error).message);
    }
  }

  try {
    await repo.flush();
  } catch (err) {
    // Imports only add drafts, and the next run fetches the sources again.
    console.error("The run's commit failed; nothing from it was saved:", (err as Error).message);
  }
}
