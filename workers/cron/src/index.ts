/**
 * Runs import jobs (data/{game}/cron_jobs) on their schedules, and on demand
 * through POST /trigger. Each run fetches the job's source and adds drafts
 * for new items (app/lib/importer); a reviewer publishes them from the admin.
 */
import { CATEGORIES_PATH } from "../../../app/lib/categories";
import { githubRepo, runRepo, type GitHubEnv } from "../../../app/lib/importer/repo";
import { importCost, importPaths, normalizeJob, runImport } from "../../../app/lib/importer/run";
import { leavesAnything, readRunLog, runLogPath, type RunLog } from "../../../app/lib/importer/run-log";

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
    ctx.waitUntil(runJobs(env, (job) => job.active !== false && job.schedule === schedule, run, schedule));
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
      ctx.waitUntil(runJobs(env, (job, jobGame) => (!game || jobGame === game) && (!jobId || job.id === jobId), Math.floor(Date.now() / 60_000), "manual"));
      return new Response("Triggered jobs manually", { status: 200 });
    }
    return new Response("Athena Cron Worker running", { status: 200 });
  },
};

type JobFilter = (job: ReturnType<typeof normalizeJob>, game: string) => boolean;

/** A game of data/_meta/games.json: its slug, and whether players see it (`active: false` hides it). */
interface GameEntry {
  slug: string;
  active: boolean;
}

/** Every game of data/_meta/games.json, in the file's order. */
function gameList(file: unknown): GameEntry[] {
  const list = Array.isArray(file) ? file : (file as { games?: unknown[] } | null)?.games ?? [];
  return list.flatMap((game): GameEntry[] => {
    if (typeof game === "string") return [{ slug: game, active: true }];
    const g = (game ?? {}) as { slug?: unknown; id?: unknown; active?: unknown };
    const slug = g.slug ?? g.id;
    return typeof slug === "string" ? [{ slug, active: g.active !== false }] : [];
  });
}

/** `items` from the `run`th (modulo their number) on: each run starts one further along. */
function rotated<T>(items: T[], run: number): T[] {
  const start = items.length === 0 ? 0 : ((run % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** The most subrequests one job's run can make through REST: its source's 3, and 5 reads (importCost). */
const ONE_JOB = 8;

/**
 * Runs the jobs `wanted` picks, within one invocation's subrequests (50 on the
 * Workers Free plan), which every fetch below counts against:
 *
 * - The run reads through GitHub GraphQL when the token allows (runRepo): the
 *   games and categories, then every game's jobs, schemas and run log, then the
 *   due jobs' states and folders, a request each. A job then costs its
 *   source's 3 requests (DNS and the fetch), and the run one commit for all of
 *   them. Through REST, each read is a request of its own, made once.
 * - Active games go first: their job files are read, and their jobs run,
 *   before an inactive game's job files are read (games that aren't live yet
 *   may still prepare their data). Through REST, reading a job file costs a
 *   request, so reads stop while one job's run still fits; the files left
 *   unread are "unchecked".
 * - A job runs only if its cost (importCost) fits what's left, keeping room
 *   for the commit; one that doesn't is "deferred". Both go to the game's run
 *   log (run-log.ts), written in the run's commit without reading anything, so
 *   the admin shows every one of them. Jobs the last run of this kind left go
 *   first (their files read first, then run first), then the rest from a
 *   place that moves along with each run, so it isn't always the same job
 *   that waits.
 * - One game's jobs failing to list or run never stops another's.
 */
async function runJobs(env: Env, wanted: JobFilter, run: number, kind: string): Promise<void> {
  let used = 0;
  const counted: typeof fetch = (input, init) => {
    used++;
    return fetch(input, init);
  };
  const budget = SUBREQUEST_LIMIT - COMMIT_RESERVE;
  const repo = runRepo(githubRepo(env, counted));
  const now = new Date();
  /** Whether reading `path` fits, keeping `reserve` too; a file read already (prefetched) costs nothing. */
  const fits = (path: string, reserve = 0) => {
    const cost = repo.pending({ files: [path] });
    return cost === 0 || used + cost + reserve <= budget;
  };

  await repo.prefetch({ files: [GAMES_PATH, CATEGORIES_PATH] });
  const games = gameList(await repo.read(GAMES_PATH));
  await repo.prefetch({
    folders: games.flatMap(({ slug }) => [`data/${slug}/cron_jobs`, `data/${slug}/schemas`]),
    files: games.map(({ slug }) => runLogPath(slug, kind)),
  });

  /** Each game's log: what the last run of this kind left (undefined: not known, no room to read it), and what this one leaves. */
  const logs = new Map<string, { last: RunLog | null | undefined; deferred: string[]; unchecked: string[] }>();

  for (const group of [games.filter((g) => g.active), games.filter((g) => !g.active)]) {
    const due: { game: string; jobId: string; job: ReturnType<typeof normalizeJob>; waited: boolean }[] = [];
    for (const { slug: game } of group) {
      let jobIds: string[];
      try {
        jobIds = await repo.list(`data/${game}/cron_jobs`);
      } catch (err) {
        console.error(`Import jobs of ${game} couldn't be listed:`, (err as Error).message);
        continue;
      }
      if (jobIds.length === 0) continue;
      const logPath = runLogPath(game, kind);
      const last = fits(logPath) ? await repo.read(logPath).then(readRunLog, () => undefined) : undefined;
      const log = { last, deferred: [] as string[], unchecked: [] as string[] };
      logs.set(game, log);
      const waited = new Set([...(last?.deferred ?? []), ...(last?.unchecked ?? [])]);
      // Files the last run couldn't read are read first, so it isn't always the same ones left unread.
      const unread = new Set(last?.unchecked ?? []);
      for (const jobId of [...jobIds.filter((id) => unread.has(id)), ...jobIds.filter((id) => !unread.has(id))]) {
        const path = `data/${game}/cron_jobs/${jobId}.json`;
        // Room for one job's run is kept: reading every file and running none helps nobody.
        if (!fits(path, ONE_JOB)) {
          log.unchecked.push(jobId);
          console.error(`Import ${game}/${jobId} not checked: subrequest budget`);
          continue;
        }
        try {
          const job = normalizeJob(await repo.read(path));
          if (wanted(job, game)) due.push({ game, jobId, job, waited: waited.has(jobId) });
        } catch (err) {
          console.error(`Import ${game}/${jobId} failed:`, (err as Error).message);
        }
      }
    }
    if (due.length === 0) continue;

    // Every due job's reads, in one request.
    const reads = await Promise.all(due.map(({ game, job }) => importPaths(repo, game, job)));
    await repo.prefetch({ files: reads.flatMap((r) => r.files), listings: reads.flatMap((r) => r.listings) });

    const order = rotated(due, run);
    for (const { game, jobId, job } of [...order.filter((d) => d.waited), ...order.filter((d) => !d.waited)]) {
      if (used + (await importCost(repo, game, job)) > budget) {
        logs.get(game)!.deferred.push(jobId);
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
  }

  // A log only when there is something to say: this run left something, or it
  // replaces one that did (or one it couldn't read). It needs no read.
  const written = [...logs].filter(([, log]) => log.deferred.length + log.unchecked.length > 0 || log.last === undefined || leavesAnything(log.last));
  const changes = written.map(([game, log]) => ({
    path: runLogPath(game, kind),
    content: { run: kind, at: now.toISOString(), deferred: log.deferred, unchecked: log.unchecked } satisfies RunLog,
  }));
  const count = (key: "deferred" | "unchecked") => written.reduce((n, [, log]) => n + log[key].length, 0);
  const message =
    count("deferred") + count("unchecked") > 0
      ? `Import run log (${kind}): ${count("deferred")} deferred, ${count("unchecked")} not checked (subrequest budget)`
      : `Import run log (${kind}): nothing left for later`;

  try {
    await repo.flush({ changes, message });
  } catch (err) {
    // Imports only add drafts, and the next run fetches the sources again.
    console.error("The run's commit failed; nothing from it was saved:", (err as Error).message);
  }
}
