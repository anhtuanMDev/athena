// A game's slug names its data: data/{slug}/ holds its schemas, screens,
// navigation, records and import jobs, and the app, the cron worker and pushes
// all find them by that slug. Renaming a slug in games.json, or dropping a
// game from it, leaves that folder where nothing looks: the app shows an empty
// game and the game's jobs stop. Nothing moves the folder, so the API refuses
// a games.json write that drops a slug whose data/{slug}/ exists. The games
// form doesn't let a slug change once the game exists (routes/_admin.games.tsx).
//
// Server only: it reads GitHub with the server's token.

import { GraphqlUnavailable, readObjects, usableText, type GraphqlTarget } from "./github-graphql";
import { decodeUtf8Base64 } from "./utf8-base64";

export const GAMES_PATH = "data/_meta/games.json";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Every game's slug in games.json, as the cron worker reads them: its slug, else its id, or the entry itself when that's text. */
export function gameSlugs(file: unknown): string[] {
  const list: unknown[] = Array.isArray(file) ? file : isObject(file) && Array.isArray(file.games) ? file.games : [];
  return list.flatMap((game) => {
    if (typeof game === "string") return [game];
    if (!isObject(game)) return [];
    const slug = game.slug ?? game.id;
    return typeof slug === "string" ? [slug] : [];
  });
}

/**
 * Why games.json can't go from `current` to `next`: each game it drops (or
 * renames) whose folder is among `withData` (the folders under data/).
 */
export function gameRemovalProblems(current: unknown, next: unknown, withData: ReadonlySet<string>): string[] {
  const kept = new Set(gameSlugs(next));
  return [...new Set(gameSlugs(current))]
    .filter((slug) => !kept.has(slug) && withData.has(slug))
    .map((slug) => `Game "${slug}" can't be renamed or removed: data/${slug}/ holds its data, which the app and the cron worker find by that slug.`);
}

export interface GamesTarget extends GraphqlTarget {
  branch: string;
}

const parsed = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A games.json that doesn't parse names no game to keep; saving fixes it.
    return null;
  }
};

/** games.json as it is on the branch, and the folders directly under data/: one GraphQL request, or two through REST. */
async function gamesAndFolders(target: GamesTarget): Promise<{ current: unknown; folders: Set<string> }> {
  try {
    const [games, data] = await readObjects(target, target.branch, [GAMES_PATH], ["data"]);
    const text = games === null ? null : games.kind === "blob" ? usableText(games.blob) : undefined;
    if (text !== undefined) {
      const folders = data?.kind === "tree" ? data.entries.filter((e) => e.type === "tree").map((e) => e.name) : [];
      return { current: parsed(text), folders: new Set(folders) };
    }
    // games.json as GraphQL couldn't give it whole: both through REST.
  } catch (err) {
    if (!(err instanceof GraphqlUnavailable)) throw err;
    console.warn(`${err.message}, reading through REST`);
  }
  const get = async (path: string) => {
    const response = await (target.fetcher ?? fetch)(
      `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(target.branch)}`,
      { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${target.token}`, "User-Agent": "athena-admin", "Cache-Control": "no-cache" } },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub answered ${response.status} reading ${path}; games.json wasn't saved.`);
    return (await response.json()) as unknown;
  };
  const [games, data] = await Promise.all([get(GAMES_PATH), get("data")]);
  const text = isObject(games) && typeof games.content === "string" ? decodeUtf8Base64(games.content) : null;
  const folders = Array.isArray(data) ? data.filter((e) => isObject(e) && e.type === "dir" && typeof e.name === "string").map((e) => (e as { name: string }).name) : [];
  return { current: parsed(text), folders: new Set(folders) };
}

/** What's wrong with writing `content` (JSON, or base64 of it) as games.json: the games it would detach from their data. */
export async function gamesWriteProblems(target: GamesTarget, content: unknown, isBase64: boolean): Promise<string[]> {
  let next: unknown = content;
  if (isBase64) {
    try {
      next = JSON.parse(decodeUtf8Base64(String(content)));
    } catch {
      next = null;
    }
  }
  const { current, folders } = await gamesAndFolders(target);
  return gameRemovalProblems(current, next, folders);
}
