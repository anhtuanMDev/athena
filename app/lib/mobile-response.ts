import { CACHE_CONTROL } from "./mobile-payload";

// How /mobile/init and /mobile/data answer, from this data center's cache
// (caches.default) or a new build, and what they tell the app about it. The
// app keeps its own copy of each payload; two headers say when a 200 isn't one
// to replace it with (a contract with the app, see MOBILE_API_CONTEXT.md):
//
// - X-Incomplete: <n>, the payload was built with n files left out (the
//   picture versions count as one). Cached a minute at most.
// - X-Stale: 1, the last complete payload built here, served because the
//   current one couldn't be built, or because KV couldn't say which is current.
//
// Never both, and never "all": a folder that can't be listed fails the build,
// which then answers with the stale copy or an error, not an empty list.
//
// The stale copy ("last good") is kept in the Cache API under a key without a
// version, so it costs no KV write; like everything there it lives in one data
// center, and only after a complete build there.

/** The number of files a payload left out; absent when it left out none. */
export const INCOMPLETE_HEADER = "X-Incomplete";
/** "1" on a payload served in place of the current one. */
export const STALE_HEADER = "X-Stale";
/** The games a stored init payload lists, so it isn't served once one is inactive. Never sent. */
const GAMES_HEADER = "X-Athena-Games";

interface PayloadCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** What a build gives: the payload, the files it left out, and for init the games it lists. */
export interface BuiltPayload {
  payload: unknown;
  leftOut: number;
  games?: string[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** A stored payload as the app gets it: never kept on the way (an admin save must reach it at once), without internal headers. */
function toClient(source: Response, stale: boolean): Response {
  const headers = new Headers(source.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete(GAMES_HEADER);
  if (stale) headers.set(STALE_HEADER, "1");
  return new Response(source.body, { status: source.status, headers });
}

export async function servePayload({
  cache,
  key,
  unconfirmedKey,
  lastGoodKey,
  build,
  gamesAllowed,
  waitUntil,
  label,
}: {
  cache: PayloadCache;
  /** The payload's cache key under its current versions; null when KV couldn't say what they are. */
  key: string | null;
  /** Where a payload built while the versions are unknown is kept, a minute at most. */
  unconfirmedKey: string;
  /** Where the last complete payload is kept, whatever its version. */
  lastGoodKey: string;
  build: () => Promise<BuiltPayload>;
  /** Whether a stored payload listing these games may still be served: not once one of them is inactive. */
  gamesAllowed?: (games: string[]) => Promise<boolean>;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** For the log. */
  label: string;
}): Promise<Response> {
  const match = (url: string) => cache.match(new Request(url)).catch(() => undefined);
  const lastGood = async () => {
    const stored = await match(lastGoodKey);
    if (!stored) return undefined;
    const games = stored.headers.get(GAMES_HEADER);
    if (games !== null && gamesAllowed && !(await gamesAllowed(JSON.parse(games)))) return undefined;
    return toClient(stored, true);
  };

  // Without the versions, no payload can be known to be current. The last
  // complete one costs nothing to serve; anything built meanwhile is kept a
  // minute, never under a version, so the KV failure can't outlive itself.
  if (key === null) {
    const stale = await lastGood();
    if (stale) return stale;
  }
  const cached = await match(key ?? unconfirmedKey);
  if (cached) return toClient(cached, false);

  let built: BuiltPayload;
  try {
    built = await build();
  } catch (err) {
    console.error(`${label} error:`, err);
    return (await lastGood()) ?? json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  const complete = built.leftOut === 0;
  const response = new Response(JSON.stringify(built.payload), {
    headers: {
      "Content-Type": "application/json",
      // Complete, under its versions: until a save bumps one. Otherwise a minute.
      "Cache-Control": complete && key !== null ? CACHE_CONTROL.complete : CACHE_CONTROL.partial,
      ...(!complete && { [INCOMPLETE_HEADER]: String(built.leftOut) }),
    },
  });
  const puts = [cache.put(new Request(key ?? unconfirmedKey), response.clone())];
  // Only a complete payload may stand in later: one missing files would keep
  // hiding them for as long as GitHub fails.
  if (complete) {
    const kept = new Response(response.clone().body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CACHE_CONTROL.complete,
        ...(built.games && { [GAMES_HEADER]: JSON.stringify(built.games) }),
      },
    });
    puts.push(cache.put(new Request(lastGoodKey), kept));
  }
  const stored = Promise.all(puts).catch((err) => console.error(`${label} cache write failed:`, err));
  if (waitUntil) waitUntil(stored);
  else await stored;
  return toClient(response, false);
}
