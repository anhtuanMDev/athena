// Records and games.json as the app reads them, checked on every write (the
// write API) and in the data repo (tools/validate-data.ts). A record's file is
// named by its id, which the app opens it by and a notification names it by
// (push.ts). The app (zms gameSchema) leaves out a game without a slug, a
// name, a developer, `active` or any of its 14 top-level colors, draws an
// invalid color as nothing, and shows no icon from a host it doesn't load.
//
// Imports no npm package: the data repo's CI runs the validator with Node alone.

import { CONTRACT_PICTURES, pictureAdvice, refusedPicture } from "./app-pictures";
import { isCategoryFolderFormat } from "./categories";
import { HEX_EXAMPLE, isAppColor } from "./colors";
import { GAME_SLUG, RECORD_ID } from "./contract";
import { PALETTE_KEYS } from "./game-palette";

import type { PicturePolicy } from "./app-pictures";

/** games.json: the games the app shows. */
const GAMES_FILE = "data/_meta/games.json";
/** A file of a game's folder: data/{game}/{folder}/{id}.json (not "_meta"'s). */
const RECORD_FILE = /^data\/([^/_][^/]*)\/([^/]+)\/([^/]+)\.json$/;
/** What a record id is (contract.ts RECORD_ID), for messages. */
const RECORD_ID_RULE = '1 to 80 lowercase letters, digits, dots and dashes, starting and ending with a letter or digit, without ".."';
/** games.json's keys that name a picture. */
const GAME_PICTURES = ["icon", "banner"] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Why a record file's name can't be the record's, if it can't. */
function recordNameProblem(game: string, id: string): string | undefined {
  if (!GAME_SLUG.test(game)) {
    return `"${game}" isn't a game slug.`;
  }
  return RECORD_ID.test(id) ? undefined : `The file name "${id}" isn't a record id: ${RECORD_ID_RULE}.`;
}

/**
 * A record file (data/{game}/{folder}/{id}.json in a record folder): its name
 * is a record id, and the record's id is its name. Other folders (syncs,
 * imports, cron_jobs, enums…) have rules of their own, or none.
 */
export function recordFileProblems(path: string, content: unknown): string[] {
  const match = RECORD_FILE.exec(path);
  if (!match || !isCategoryFolderFormat(match[2])) {
    return [];
  }
  const [, game, , id] = match;
  const problem = recordNameProblem(game, id) ?? (isObject(content) && content.id === id ? undefined : `The record's id must be "${id}", its file's name.`);
  return problem === undefined ? [] : [problem];
}

/** What a game's checks share: where it is in the list, the slugs before it, and the app's picture hosts. */
interface GameCheck {
  where: string;
  slugs: Set<string>;
  policy: PicturePolicy;
}

/** A game's slug: the app's format, and not one an earlier game uses. */
function slugProblems(slug: unknown, { where, slugs }: GameCheck): string[] {
  if (typeof slug !== "string" || !GAME_SLUG.test(slug)) {
    return [`${where}: "${String(slug)}" can't be a slug: 1 to 40 lowercase letters, digits and -, starting and ending with a letter or digit.`];
  }
  if (slugs.has(slug)) {
    return [`${where}: the slug "${slug}" is used twice.`];
  }
  slugs.add(slug);
  return [];
}

/** A game's name, developer (text, may be empty) and `active`. */
function identityProblems(game: Record<string, unknown>, where: string): string[] {
  const checks: [boolean, string][] = [
    [typeof game.name === "string" && game.name.trim() !== "", `${where}: it needs a name.`],
    [typeof game.developer === "string", `${where}: developer must be text (it may be empty).`],
    [typeof game.active === "boolean", `${where}: active must be true or false.`],
  ];
  return checks.filter(([isFine]) => !isFine).map(([, message]) => message);
}

/** A game's icon and banner: pictures the app loads, when set. */
function gamePictureProblems(game: Record<string, unknown>, { where, policy }: GameCheck): string[] {
  return GAME_PICTURES.flatMap((key) => {
    const value = game[key];
    if (value === undefined || value === "") {
      return [];
    }
    const refused = typeof value === "string" ? refusedPicture(value, policy) : JSON.stringify(value);
    return refused === undefined ? [] : [`${where}: the app won't load the ${key} ${refused}: ${pictureAdvice(policy)}.`];
  });
}

/** A game's light palette: any part of it, each color set a hex one. */
function lightProblems(light: unknown, where: string): string[] {
  if (light === undefined) {
    return [];
  }
  if (!isObject(light)) {
    return [`${where}: light must be an object of colors.`];
  }
  return PALETTE_KEYS.filter((key) => light[key] !== undefined && light[key] !== "" && !isAppColor(light[key])).map(
    (key) => `${where}: light.${key} must be ${HEX_EXAMPLE}.`,
  );
}

/** A game's 14 top-level colors, all hex, and its light palette. */
function paletteProblems(game: Record<string, unknown>, where: string): string[] {
  const dark = PALETTE_KEYS.filter((key) => !isAppColor(game[key])).map((key) => `${where}: ${key} must be ${HEX_EXAMPLE}.`);
  return [...dark, ...lightProblems(game.light, where)];
}

/** Problems with one game of games.json. */
function gameProblems(game: unknown, check: GameCheck): string[] {
  if (!isObject(game)) {
    return [`${check.where} must be an object.`];
  }
  return [...slugProblems(game.slug, check), ...identityProblems(game, check.where), ...gamePictureProblems(game, check), ...paletteProblems(game, check.where)];
}

/** Problems with games.json that make the app leave a game out or draw it wrong. Keys it doesn't know are left alone. */
export function gamesFileProblems(raw: unknown, policy: PicturePolicy = CONTRACT_PICTURES): string[] {
  if (!isObject(raw) || !Array.isArray(raw.games)) {
    return ['games.json needs a "games" list.'];
  }
  const games: unknown[] = raw.games;
  const slugs = new Set<string>();
  return games.flatMap((game, index) => gameProblems(game, { where: `Game ${String(index + 1)}`, slugs, policy }));
}

/** Problems with games.json or a record file, by path; none for any other file. */
export const dataFileProblems = (path: string, content: unknown, policy: PicturePolicy = CONTRACT_PICTURES): string[] =>
  path === GAMES_FILE ? gamesFileProblems(content, policy) : recordFileProblems(path, content);
