// What a screen, navigation or schema file may contain before it is saved.
//
// The admin's editor checks this to warn early, and the write API
// (functions/api) checks it again so a tampered client can't save past it.
// The mobile app enforces its own copy of the link policy
// (zms: src/content/policy.ts) — keep LINK_HOSTS in sync.

import { CATEGORIES_PATH, DEFAULT_CATEGORIES, needsCategories, normalizeCategories, referenceEndpoints, type Category } from "./categories";
import { notifyTemplateProblems } from "./notify-template";
import { decodeUtf8Base64 } from "./utf8-base64";

export const LINK_HOSTS = [
  "playoverwatch.com",
  "overwatch.blizzard.com",
  "news.blizzard.com",
  "blizzard.com",
  "marvelrivals.com",
  "youtube.com",
  "youtu.be",
];

/** Limits of the admin's own: what the app does with longer values doesn't depend on them. */
export const LIMITS = {
  tabLabel: 24,
  title: 120,
  /** Bytes of one screen file. */
  screenSize: 200_000,
};

/** What the app drops or cuts short (zms src/content/policy.ts LIMITS). */
export interface AppLimits {
  screensPerGame: number;
  blocksPerScreen: number;
  tabs: number;
  /** Entries a list block shows, and the most a source may ask for. */
  listItems: number;
  /** Tiles, info rows and similar small lists inside one block. */
  smallList: number;
  /** Characters of one text value. */
  text: number;
}

export interface AppPolicy {
  limits: AppLimits;
  /** Screens the app provides itself, which tabs and actions may open (zms model.ts APP_SCREENS). */
  appScreens: string[];
}

/**
 * The app's policy as of this admin. The block manifest carries the app's own
 * under "$policy" (generated from its source by `npm run primitives`), which
 * replaces these key by key; these stay for a manifest without one.
 */
export const APP_POLICY: AppPolicy = {
  limits: { screensPerGame: 50, blocksPerScreen: 60, tabs: 5, listItems: 100, smallList: 12, text: 2000 },
  appScreens: ["app:settings"],
};

/** The block manifest, generated from the app's source. */
export const MANIFEST_PATH = "data/_meta/mobile_primitives.json";

const SCREEN_TYPES = ["home", "list", "detail", "page"];
const SCREEN_ID = /^[a-z0-9][a-z0-9-]*$/;
const APP_SCREEN = /^app:[a-z]+$/;
const BLOCK_TYPE = /^[a-z0-9_]+$/;
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CATEGORY = /^[a-z0-9_-]+$/;
/** Props the app never accepts from a file: styles and callbacks. */
export const BLOCKED_PROP = /^(style|on[A-Z].*|children|ref|key)$/;

/** The host of an https URL, or undefined for anything else (other schemes, credentials, IPs). */
export function httpsHost(url: unknown): string | undefined {
  if (typeof url !== "string" || url.length > 2048) return undefined;
  const match = /^https:\/\/([^/?#\s]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!match) return undefined;
  const authority = match[1].toLowerCase();
  if (authority.includes("@")) return undefined;
  const host = authority.replace(/:443$/, "");
  if (!/^[a-z0-9.-]+$/.test(host) || /^[0-9.]+$/.test(host)) return undefined;
  return host;
}

/** Whether the app will open this link (https, on an allowed site or its subdomains). */
export function isAllowedLink(url: unknown): boolean {
  const host = httpsHost(url);
  return host !== undefined && LINK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The app's policy from a parsed block manifest: its "$policy" limits and app
 * screens, each malformed value replaced by APP_POLICY's. The manifest's other
 * policy keys (link and image hosts…) are the app's business and are ignored.
 */
export function appPolicy(manifest: unknown): AppPolicy {
  const raw = isObject(manifest) && isObject(manifest.$policy) ? manifest.$policy : {};
  const given = isObject(raw.limits) ? raw.limits : {};
  const limits = { ...APP_POLICY.limits };
  for (const key of Object.keys(limits) as (keyof AppLimits)[]) {
    const value = given[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) limits[key] = value;
  }
  const appScreens = Array.isArray(raw.appScreens)
    ? [...new Set(raw.appScreens.filter((s): s is string => typeof s === "string" && APP_SCREEN.test(s)))]
    : [...APP_POLICY.appScreens];
  return { limits, appScreens };
}

/** The app's policy from the data repo's manifest, read with `read`; APP_POLICY when it can't be read. */
export async function readAppPolicy(read: (path: string) => Promise<string>): Promise<AppPolicy> {
  try {
    return appPolicy(JSON.parse(await read(MANIFEST_PATH)));
  } catch (err) {
    if ((err as { status?: number } | null)?.status !== 404) console.error("The block manifest couldn't be read; using the built-in app policy:", err);
    return APP_POLICY;
  }
}

const SCREEN_PATH = /^data\/[^/]+\/screens\/[^/]+\.json$/;
const NAVIGATION_PATH = /^data\/[^/]+\/navigation\.json$/;

/** Whether checking a write to `path` needs the app's policy: screens and navigation. */
export const needsAppPolicy = (path: string) => SCREEN_PATH.test(path) || NAVIGATION_PATH.test(path);

/** Whether `screen` is one the app provides itself ("app:settings"). */
export function isAppScreen(screen: string, policy: AppPolicy = APP_POLICY): boolean {
  return policy.appScreens.includes(screen);
}

/** A link read from a record: "data.<field>" on the screen's record, "item.<field>" on each entry of a list block. */
export const BOUND_LINK = /^(data|item)\.[A-Za-z0-9_.]+$/;

/** Every `url` inside a value, with the path to it, for checking links nested in props. */
function findUrls(value: unknown, path: string, out: { path: string; url: unknown }[] = []) {
  if (Array.isArray(value)) value.forEach((entry, i) => findUrls(entry, `${path}[${i}]`, out));
  else if (isObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "url") out.push({ path: `${path}.url`, url: nested });
      else findUrls(nested, `${path}.${key}`, out);
    }
  }
  return out;
}

/** Problems that make a screen file unsafe or unreadable for the app; empty when it can be saved. */
export function validateScreenFile(raw: unknown, policy: AppPolicy = APP_POLICY): string[] {
  if (!isObject(raw)) return ["A screen must be a JSON object."];
  const errors: string[] = [];
  if (JSON.stringify(raw).length > LIMITS.screenSize) errors.push("The screen file is too large.");
  if (!SCREEN_TYPES.includes(raw.type as string)) errors.push(`type must be one of ${SCREEN_TYPES.join(", ")}.`);
  if (raw.title !== undefined && (typeof raw.title !== "string" || raw.title.length > LIMITS.title)) {
    errors.push(`title must be text of at most ${LIMITS.title} characters.`);
  }
  if (raw.appearance !== undefined && raw.appearance !== "light" && raw.appearance !== "dark") {
    errors.push("appearance must be light or dark.");
  }
  if (raw.source !== undefined && (!isObject(raw.source) || !CATEGORY.test(String(raw.source.category ?? "")))) {
    errors.push("source must name a category.");
  }
  if (raw.accent !== undefined && (typeof raw.accent !== "string" || !/^(#[0-9a-fA-F]{3,8}|data\.[a-z0-9_.]+)$/.test(raw.accent))) {
    errors.push('accent must be a hex color such as #FF8200, or "data.<field>".');
  }
  if (!Array.isArray(raw.blocks)) return [...errors, "blocks must be a list."];
  if (raw.blocks.length > policy.limits.blocksPerScreen) errors.push(`A screen can have at most ${policy.limits.blocksPerScreen} blocks.`);

  const ids = new Set<string>();
  raw.blocks.forEach((block, i) => {
    const where = `Block ${i + 1}`;
    if (!isObject(block)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    if (typeof block.id !== "string" || !BLOCK_ID.test(block.id)) errors.push(`${where} needs an id of letters, numbers, - or _.`);
    else if (ids.has(block.id)) errors.push(`${where} repeats the id "${block.id}".`);
    else ids.add(block.id);
    if (typeof block.type !== "string" || !BLOCK_TYPE.test(block.type)) errors.push(`${where} has an invalid type.`);
    if (block.visible !== undefined && typeof block.visible !== "boolean") errors.push(`${where}: visible must be true or false.`);
    if (block.tab !== undefined && typeof block.tab !== "string") errors.push(`${where}: tab must be text.`);
    if (!isObject(block.props)) {
      errors.push(`${where} needs props as an object.`);
      return;
    }
    for (const name of Object.keys(block.props)) {
      if (BLOCKED_PROP.test(name)) errors.push(`${where}: "${name}" isn't allowed in screen files.`);
    }
    for (const { path, url } of findUrls(block.props, "props")) {
      // A bound link ("data.url", "item.url") comes from a record; the app checks
      // what it resolves to against the same list before opening it.
      if (url !== "" && !BOUND_LINK.test(String(url)) && !isAllowedLink(url)) {
        errors.push(`${where} links to ${String(url)} (${path}), which isn't an allowed https site.`);
      }
    }
  });
  return errors;
}

/** Problems with navigation.json; `screenTypes` maps each of the game's screens to its type. */
export function validateNavigationFile(raw: unknown, screenTypes?: Record<string, unknown>, policy: AppPolicy = APP_POLICY): string[] {
  if (!isObject(raw) || !Array.isArray(raw.tabs)) return ["Navigation needs a list of tabs."];
  const errors: string[] = [];
  if (raw.tabs.length === 0) errors.push("Add at least one tab: the first one is Home.");
  if (raw.tabs.length > policy.limits.tabs) errors.push(`The tab bar fits at most ${policy.limits.tabs} tabs.`);
  // The app tells tabs apart by their screen (zms TabBar), so each opens its own.
  const firstTabOf = new Map<string, number>();
  raw.tabs.forEach((tab, i) => {
    const where = `Tab ${i + 1}`;
    if (!isObject(tab)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const screen = typeof tab.screen === "string" ? tab.screen : "";
    const appScreen = screen.startsWith("app:");
    if (appScreen && !isAppScreen(screen, policy)) {
      // The app leaves out a tab to a screen it doesn't provide (zms normalizeNavigation).
      errors.push(`${where} opens "${screen}", which the app doesn't have: use ${policy.appScreens.join(", ") || "one of the game's screens"}.`);
    } else if (!appScreen && !SCREEN_ID.test(screen)) errors.push(`${where} needs a screen.`);
    else if (screenTypes && !appScreen) {
      if (!Object.hasOwn(screenTypes, screen)) errors.push(`${where} opens "${screen}", which doesn't exist.`);
      else if (screenTypes[screen] === "detail") {
        errors.push(`${where} opens "${screen}", a detail screen: it shows one entry picked from a list, so it can't be a tab.`);
      }
    }
    if (screen && firstTabOf.has(screen)) {
      errors.push(`${where} opens "${screen}", as tab ${firstTabOf.get(screen)! + 1} does: the app keeps one tab per screen.`);
    } else if (screen) firstTabOf.set(screen, i);
    if (i === 0 && appScreen) errors.push("The first tab is Home: it must open one of the game's screens.");
    if (typeof tab.label !== "string" || !tab.label.trim() || tab.label.length > LIMITS.tabLabel) {
      errors.push(`${where} needs a label of at most ${LIMITS.tabLabel} characters.`);
    }
    if (tab.icon !== undefined && typeof tab.icon !== "string") errors.push(`${where}: icon must be text.`);
  });
  return errors;
}

type Categories = readonly Pick<Category, "folder">[];

/**
 * Problems with a schema file: reference fields, nested ones included, that
 * point anywhere but a category folder of the record's own game. The editor's
 * picker can only load those, so any other endpoint leaves the field
 * impossible to fill in.
 */
export function validateSchemaFile(raw: unknown, categories: Categories = DEFAULT_CATEGORIES): string[] {
  if (!isObject(raw)) return ["A schema must be a JSON object."];
  const endpoints = referenceEndpoints(categories);
  const errors: string[] = [];
  const check = (fields: unknown, prefix: string) => {
    if (!Array.isArray(fields)) return;
    for (const field of fields) {
      if (!isObject(field)) continue;
      const name = `${prefix}${String(field.key ?? "?")}`;
      if ((field.type === "reference" || field.type === "reference_list") && !endpoints.includes(String(field.referenceApiEndpoint))) {
        errors.push(`${name} reads its options from "${String(field.referenceApiEndpoint ?? "")}"; use one of ${endpoints.join(", ")}.`);
      }
      check(field.subFields, `${name}.`);
    }
  };
  check(raw.fields, "");
  return errors;
}

/**
 * Validation for a data file about to be written, by path; other files have
 * no rules here. categories.json must pass its normalizer untouched, and its
 * notification templates may only use `templateFields` (by category, from
 * notify-template.ts); without them, only the built-in fields. Screens and
 * navigation follow the app's `policy` (readAppPolicy), as the editors do.
 */
export function validateDataFile(
  path: string,
  content: unknown,
  categories: Categories = DEFAULT_CATEGORIES,
  templateFields: Record<string, string[]> = {},
  policy: AppPolicy = APP_POLICY,
): string[] {
  if (SCREEN_PATH.test(path)) return validateScreenFile(content, policy);
  if (NAVIGATION_PATH.test(path)) return validateNavigationFile(content, undefined, policy);
  if (needsCategories(path)) return validateSchemaFile(content, categories);
  if (path === CATEGORIES_PATH) {
    const normalized = normalizeCategories(content);
    return [...normalized.problems, ...notifyTemplateProblems(normalized.categories, templateFields)];
  }
  return [];
}

/**
 * Problems with a write the API is asked to make. Assets arrive as base64; a
 * JSON data file sent that way is decoded and checked like one sent as JSON,
 * so the encoding can't be used to skip validateDataFile.
 */
export function dataWriteProblems(
  path: string,
  content: unknown,
  isBase64: boolean,
  categories: Categories = DEFAULT_CATEGORIES,
  templateFields: Record<string, string[]> = {},
  policy: AppPolicy = APP_POLICY,
): string[] {
  if (!isBase64) return validateDataFile(path, content, categories, templateFields, policy);
  if (!/^data\/.+\.json$/.test(path)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8Base64(String(content)));
  } catch {
    return ["The file isn't valid JSON."];
  }
  return validateDataFile(path, parsed, categories, templateFields, policy);
}
