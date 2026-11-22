import { Octokit } from "@octokit/rest";

import { CATEGORIES_PATH, DEFAULT_CATEGORIES, readCategories, readsCategories } from "../categories";
import { GAMES_PATH, gamesWriteProblems } from "../games-guard";
import { githubReader, readJsonTogether, type RepoReader } from "../mobile-payload";
import { templateFieldsByCategory } from "../notify-template";
import { APP_POLICY, dataWriteProblems, needsAppPolicy, readAppPolicy } from "../screen-policy";

import { dataBranch, dataReader, type Env } from "./env";
import { HttpError, STATUS, json } from "./http";

import type { WriteRequest } from "./write-requests";

// The checks a data/file write runs before GitHub sees it, which may read other files of the data branch.

const SLUG = /^[a-z0-9-]+$/;

/**
 * Every game's schema fields by category, for checking categories.json's
 * templates. A schema that can't be read refuses the save rather than check
 * against part of them: 1 + games + schemas GitHub reads, on a rare save.
 */
async function schemaTemplateFields(reader: RepoReader): Promise<Record<string, string[]>> {
  const games = ((JSON.parse(await reader.read("data/_meta/games.json")) as { games?: { slug?: unknown }[] }).games ?? []);
  const slugs = games.map((game) => game.slug).filter((slug): slug is string => typeof slug === "string" && SLUG.test(slug));
  // Every game's schemas in one request when the reader can.
  const together = readJsonTogether(reader, slugs.map((slug) => `data/${slug}/schemas`), []);
  const folders = await Promise.all(slugs.map((slug) => together.folder(`data/${slug}/schemas`)));
  if (folders.some((folder) => folder.partial)) {
    throw new HttpError(json({ error: "Some schemas couldn't be read to check the notification templates. Try again." }, STATUS.unavailable));
  }
  return templateFieldsByCategory(folders.flatMap((folder) => folder.files.map((file) => file.content)));
}

/** Why a write can't be saved: the file's own checks, which may read categories, schemas, the manifest or the tree. */
export async function writeProblems(env: Env, body: WriteRequest): Promise<string[]> {
  const isBase64 = body.isBase64 === true;
  // A schema's references and a screen's sources must name configured categories, which only then need reading.
  const categories = readsCategories(body.path)
    ? await readCategories((path) => githubReader(new Octokit({ auth: env.GITHUB_TOKEN }), env.GITHUB_OWNER, env.GITHUB_REPO, dataBranch(env)).read(path))
    : DEFAULT_CATEGORIES;
  // Screens and navigation drive the mobile app; reject unsafe or unreadable ones
  // here too, not only in the editor, so a tampered client can't save them,
  // whether it sends them as JSON or as base64.
  // Notification templates may only name fields the categories' schemas have.
  const templateFields = body.path === CATEGORIES_PATH ? await schemaTemplateFields(dataReader(env)) : undefined;
  // Their limits and the app's own screens come from the block manifest, as in the editors.
  const policy = needsAppPolicy(body.path) ? await readAppPolicy((path) => dataReader(env).read(path)) : APP_POLICY;
  const problems = dataWriteProblems(body.path, body.content, isBase64, categories, templateFields, policy);
  // A game dropped or renamed while data/{slug}/ exists would lose its data (app/lib/games-guard.ts).
  if (decodeURIComponent(body.path) === GAMES_PATH) {
    problems.push(...(await gamesWriteProblems({ token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO, branch: dataBranch(env) }, body.content, isBase64)));
  }
  return problems;
}
