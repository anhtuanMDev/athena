import { gitBlobSha } from "../asset-headers";
import { GAMES_PATH, gamesWriteProblems } from "../games-guard";
import { RepoError, githubRepo } from "../importer/repo";
import { jsonFileText } from "../json-file";
import { pictureProblem } from "../picture-rules";
import { SAFE_SLUG } from "../safe-path";
import { dataWriteProblems } from "../screen-policy";
import { isPictureToken, pictureToken } from "../session";

import { commitChecked } from "./commit";

import type { GitHubEnv } from "../importer/repo";

// games.json and a game's icon, saved in one commit: the icon goes up first as
// a blob (POST /api/data/game-icon), which commits nothing, then one request
// commits it with games.json (POST /api/data/save-games). The icon was a
// commit of its own (POST /api/data/file), so a refused or failed games.json
// left it committed, and a save ran the push webhook twice.

/** The Function's environment as these routes use it. */
export interface GamesEnv extends GitHubEnv {
  SESSION_SECRET: string;
}

/** A route's answer: its status and body, and the paths it wrote, whose cached copies are then forgotten. */
export interface ApiAnswer {
  status: number;
  body: unknown;
  written?: string[];
}

/** A game's icon to upload: its game, where it goes, and its bytes as base64. */
export interface GameIconRequest {
  slug: string;
  path: string;
  base64: string;
}

/** An icon a save commits: where it goes, the blob its upload made, and the token the upload gave for it. */
export interface SavedIcon {
  path: string;
  sha: string;
  token: string;
}

/** games.json to commit, at the sha the games page read, with the icon it names if one was picked. */
export interface GamesSaveRequest {
  sha: string;
  content: Record<string, unknown>;
  message: string;
  icon?: SavedIcon;
}

/** What the per-file write (POST /api/data/file) says to a picture. */
export const PICTURES_ELSEWHERE = "Pictures are saved with their record (POST /api/data/save-record) or with games.json (POST /api/data/save-games), never on their own.";

const BAD_REQUEST = 400;
const OK = 200;
const UNAVAILABLE = 503;
const UNPROCESSABLE = 422;
const CONFLICT = 409;
const BLOB_SHA = /^[0-9a-f]{40}$/;
/** A game's icon: public/assets/games/{slug}-icon.{extension}, as the games page names it. */
const GAME_ICON = /^public\/assets\/games\/([a-z0-9-]+)-icon\.[A-Za-z0-9]+$/;
const ASSETS = "public/assets/";

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const refusal = (error: string, status = BAD_REQUEST): ApiAnswer => ({ status, body: { error } });

/** `body` as an icon upload, or why it isn't one (a 400). Its bytes are the picture rules' to check. */
export function gameIconRequest(body: unknown): GameIconRequest | string {
  const fields = isPlainObject(body) ? body : {};
  const { slug, path, base64 } = fields;
  if (typeof slug !== "string" || !SAFE_SLUG.test(slug)) {
    return "Invalid game.";
  }
  if (typeof path !== "string" || GAME_ICON.exec(path)?.[1] !== slug) {
    return `The icon of ${slug} goes in ${ASSETS}games/${slug}-icon.png, .jpg or .webp.`;
  }
  return typeof base64 === "string" ? { slug, path, base64 } : "Send the icon as base64.";
}

/** Whether a game of `content` names `path` as its icon, as the app loads it (/api/assets/...). */
function namesIcon(content: Record<string, unknown>, path: string): boolean {
  const url = `/api/assets/${path.slice(ASSETS.length)}`;
  return Array.isArray(content.games) && content.games.some((game) => isPlainObject(game) && game.icon === url);
}

/** Whether `icon` holds an upload's path, blob sha and token. */
const isUploadShape = (icon: Record<string, unknown>): icon is Record<string, unknown> & SavedIcon =>
  typeof icon.path === "string" && typeof icon.token === "string" && typeof icon.sha === "string" && BLOB_SHA.test(icon.sha);

/** The icon of a save, or why it isn't one: the upload's path, blob and token, for a game of games.json. */
function savedIcon(icon: unknown, content: Record<string, unknown>): SavedIcon | string {
  if (!isPlainObject(icon) || !isUploadShape(icon)) {
    return "Invalid icon.";
  }
  if (!GAME_ICON.test(icon.path) || !namesIcon(content, icon.path)) {
    return `${icon.path} isn't the icon of a game in games.json.`;
  }
  return { path: icon.path, sha: icon.sha, token: icon.token };
}

/** Why `fields` isn't a games.json save, its icon aside: a 400's message, or null. */
function saveShapeProblem(fields: Record<string, unknown>): string | null {
  if (typeof fields.sha !== "string" || !BLOB_SHA.test(fields.sha)) {
    return "Invalid sha.";
  }
  if (!isPlainObject(fields.content)) {
    return "games.json must be an object.";
  }
  const { message } = fields;
  return message !== undefined && (typeof message !== "string" || message.trim() === "") ? "Invalid commit message." : null;
}

/** `body` as a games.json save, or why it isn't one (a 400). games.json's own checks come after. */
export function gamesSaveRequest(body: unknown): GamesSaveRequest | string {
  const fields = isPlainObject(body) ? body : {};
  const problem = saveShapeProblem(fields);
  if (problem !== null) {
    return problem;
  }
  const content = fields.content as Record<string, unknown>;
  const icon = fields.icon === undefined ? undefined : savedIcon(fields.icon, content);
  if (typeof icon === "string") {
    return icon;
  }
  const message = typeof fields.message === "string" ? fields.message : `Update ${GAMES_PATH}`;
  return { sha: String(fields.sha), content, message, ...(icon && { icon }) };
}

/** Uploads an icon as a blob, and gives the server's token for that blob at that path. 1 GitHub request. */
export async function uploadGameIcon(env: GamesEnv, request: GameIconRequest): Promise<ApiAnswer> {
  const problem = pictureProblem(request.path, request.base64);
  if (problem) {
    return refusal(problem.error, problem.status);
  }
  try {
    const sha = await githubRepo(env).createBlob(request.base64);
    return { status: OK, body: { path: request.path, sha, token: await pictureToken(env.SESSION_SECRET, request.path, sha) } };
  } catch (err) {
    if (err instanceof RepoError && err.status === UNPROCESSABLE) {
      return refusal(`GitHub refused ${request.path}.`);
    }
    throw err;
  }
}

/** What's wrong with `content` as games.json: the checks the per-file write ran, and the games it would detach from their data. */
async function gamesProblems(env: GamesEnv, content: unknown): Promise<string[]> {
  const target = { token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH ?? "main" };
  return [...dataWriteProblems(GAMES_PATH, content, false), ...(await gamesWriteProblems(target, content, false))];
}

const CONFLICTS = {
  exists: "games.json exists already.",
  deleted: "games.json was deleted since it was loaded.",
  modified: "games.json was modified since it was loaded.",
  moving: "the data kept changing while saving. Save again.",
} as const;

/** Why a save of games.json is refused before anything is committed, or null. */
async function saveRefusal(env: GamesEnv, { icon, content }: GamesSaveRequest): Promise<ApiAnswer | null> {
  if (icon && !(await isPictureToken(icon.token, env.SESSION_SECRET, icon.path, icon.sha))) {
    return refusal(`${icon.path} wasn't uploaded for this path. Pick the picture again.`);
  }
  const problems = await gamesProblems(env, content);
  return problems.length > 0 ? refusal(`This file can't be saved: ${problems.join(" ")}`) : null;
}

/** A failure of the commit as the editor's answer: GitHub unavailable (503), or an icon it doesn't have. Anything else is thrown. */
function repoRefusal(err: unknown): ApiAnswer {
  if (err instanceof RepoError && err.status === UNAVAILABLE) {
    return refusal(err.message, UNAVAILABLE);
  }
  if (err instanceof RepoError && err.status === UNPROCESSABLE) {
    return refusal("GitHub refused the save's icon. Pick it again and save.");
  }
  throw err;
}

/** games.json and its icon, committed if games.json is still at the sha the page read. */
async function commitGames(env: GamesEnv, { icon, content, sha, message }: GamesSaveRequest): Promise<ApiAnswer> {
  const changes = [{ path: GAMES_PATH, content }, ...(icon ? [{ path: icon.path, blob: icon.sha }] : [])];
  const saved = await commitChecked(githubRepo(env), { path: GAMES_PATH, sha, reads: [], changes, message });
  if ("conflict" in saved) {
    return { status: CONFLICT, body: { error: `Conflict on ${GAMES_PATH}: ${CONFLICTS[saved.conflict]}`, conflict: true } };
  }
  // The file's sha as committed (commitOn writes jsonFileText), so the page can keep saving.
  const written = await gitBlobSha(new TextEncoder().encode(jsonFileText(content)));
  return { status: OK, body: { ok: true, sha: written, commit: saved.commit }, written: [...(icon ? [icon.path] : []), GAMES_PATH] };
}

/**
 * games.json and its picked icon in one commit, at the sha the games page
 * read; the icon only if the server uploaded it for that very path. Subrequests
 * at most: the session (1), the games guard (1, or 2 through REST), the
 * snapshot (3) and the commit (4), twice when the branch moved, and the
 * icon's cached copies and mobile versions (4).
 */
export async function saveGames(env: GamesEnv, request: GamesSaveRequest): Promise<ApiAnswer> {
  const refused = await saveRefusal(env, request);
  if (refused) {
    return refused;
  }
  try {
    return await commitGames(env, request);
  } catch (err) {
    return repoRefusal(err);
  }
}
