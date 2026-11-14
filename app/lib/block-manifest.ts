// The block manifest the app generates (zms npm run primitives), as far as
// it isn't the app's policy itself (screen-policy.ts appPolicy): each block's
// spec, and the contract keys of "$policy" (spec §2). zms's generator writes
// those from its src/content/policy.ts, and each must be this admin's
// (contract.ts), or the two sides would check ids, colours, folders,
// pictures and pushes differently. "$policy.fixtures" holds the SHA-256 of
// each shared fixture as zms has it, which must be that of the admin's copy
// (tests/fixtures): the caller hashes those, as this module is also bundled
// into the browser and reads no file.

import {
  ANDROID_CHANNEL_ID,
  ASSET_VERSION,
  ASSET_VERSION_LENGTH,
  BOUND_LINK,
  CATEGORY_NAME,
  FIELD_KEY,
  FOLDER_NAME,
  GAME_SLUG,
  HEX_COLOR,
  IMAGE_VARIANTS,
  PUSH_TOPIC,
  RECORD_ID,
  RESERVED_CATEGORIES,
  RESERVED_FOLDERS,
  SCREEN_ID,
  SHARED_FIXTURES,
} from "./contract";

/** The SHA-256 (lowercase hex) of the admin's copy of each shared fixture, by file name. */
export type FixtureHashes = Readonly<Partial<Record<string, string>>>;

/** A "$policy" key compared with a value of contract.ts: whether the manifest's is the same, and what it must be. */
interface ValueCheck {
  key: string;
  isSame: (value: unknown) => boolean;
  expected: string;
}

/** A block's type, in the manifest and in a screen file. */
export const BLOCK_TYPE = /^[a-z0-9_]+$/;

const CONTRACT = "app/lib/contract.ts";

/** "$policy.patterns": each key, the contract's pattern it holds the source of, and that pattern's name in contract.ts. */
const PATTERNS: Readonly<Record<string, { pattern: RegExp; name: string }>> = {
  gameSlug: { pattern: GAME_SLUG, name: "GAME_SLUG" },
  recordId: { pattern: RECORD_ID, name: "RECORD_ID" },
  screenId: { pattern: SCREEN_ID, name: "SCREEN_ID" },
  category: { pattern: CATEGORY_NAME, name: "CATEGORY_NAME" },
  folder: { pattern: FOLDER_NAME, name: "FOLDER_NAME" },
  fieldKey: { pattern: FIELD_KEY, name: "FIELD_KEY" },
  boundLink: { pattern: BOUND_LINK, name: "BOUND_LINK" },
  color: { pattern: HEX_COLOR, name: "HEX_COLOR" },
  assetVersion: { pattern: ASSET_VERSION, name: "ASSET_VERSION" },
};
const PATTERN_KEYS = Object.keys(PATTERNS).join(", ");

/** What to do when a fixture's hash differs, as ADMIN_APP_CONTEXT.md describes it. */
const FIXTURE_FLOW =
  "the shared fixture differs between the admin and the app: edit it the same way in both repos, regenerate the app's manifest (zms npm run primitives), then copy it to the admin's tests/fixtures and to zero-backend's data/_meta";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether `value` lists each of `expected` once, in any order. */
const isSameSet = (value: unknown, expected: readonly string[]): boolean =>
  Array.isArray(value) && value.length === expected.length && expected.every((entry) => value.includes(entry));

/** Whether `value` lists `expected`, in its order. */
const isSameList = (value: unknown, expected: readonly string[]): boolean =>
  Array.isArray(value) && value.length === expected.length && expected.every((entry, index) => value[index] === entry);

const VALUE_CHECKS: readonly ValueCheck[] = [
  {
    key: "reservedFolders",
    isSame: (value) => isSameSet(value, RESERVED_FOLDERS),
    expected: `the admin's reserved folders, in any order (RESERVED_FOLDERS in ${CONTRACT}): ${RESERVED_FOLDERS.join(", ")}`,
  },
  {
    key: "reservedCategories",
    isSame: (value) => isSameSet(value, RESERVED_CATEGORIES),
    expected: `the admin's reserved categories, in any order (RESERVED_CATEGORIES in ${CONTRACT}): ${RESERVED_CATEGORIES.join(", ")}`,
  },
  {
    key: "imageVariants",
    isSame: (value) => isSameList(value, IMAGE_VARIANTS),
    expected: `the admin's picture variants, in this order (IMAGE_VARIANTS in ${CONTRACT}): ${IMAGE_VARIANTS.join(", ")}`,
  },
  {
    key: "assetVersionLength",
    isSame: (value) => value === ASSET_VERSION_LENGTH,
    expected: `${String(ASSET_VERSION_LENGTH)} (ASSET_VERSION_LENGTH in ${CONTRACT})`,
  },
];

/** "$policy.patterns": exactly the contract's keys, each the source of its pattern (which covers assetVersion's length too). */
function patternProblems(given: unknown): string[] {
  if (!isObject(given)) {
    return [`"$policy.patterns" must be an object of the contract's patterns (${CONTRACT}): ${PATTERN_KEYS}.`];
  }
  const wrong = Object.entries(PATTERNS)
    .filter(([key, { pattern }]) => given[key] !== pattern.source)
    .map(([key, { pattern, name }]) => `"$policy.patterns.${key}" must be ${pattern.source} (${name} in ${CONTRACT}).`);
  const unknown = Object.keys(given)
    .filter((key) => !Object.hasOwn(PATTERNS, key))
    .map((key) => `"$policy.patterns.${key}" isn't a pattern of the contract, which has ${PATTERN_KEYS} only.`);
  return [...wrong, ...unknown];
}

/** "$policy.push": the topic the admin sends to and the Android channel its messages name. */
function pushProblems(given: unknown): string[] {
  const push = isObject(given) ? given : {};
  return [
    ...(push.topic === PUSH_TOPIC ? [] : [`"$policy.push.topic" must be "${PUSH_TOPIC}" (PUSH_TOPIC in ${CONTRACT}).`]),
    ...(push.androidChannel === ANDROID_CHANNEL_ID ? [] : [`"$policy.push.androidChannel" must be "${ANDROID_CHANNEL_ID}" (ANDROID_CHANNEL_ID in ${CONTRACT}).`]),
  ];
}

/** "$policy.fixtures": the shared fixtures by name, each hash that of the admin's copy. */
function fixtureProblems(given: unknown, hashes: FixtureHashes): string[] {
  if (!isObject(given)) {
    return [`"$policy.fixtures" must be an object of the SHA-256 of each shared fixture (SHARED_FIXTURES in ${CONTRACT}): ${SHARED_FIXTURES.join(", ")}.`];
  }
  const wrong = SHARED_FIXTURES.filter((name) => hashes[name] === undefined || given[name] !== hashes[name]).map(
    (name) => `"$policy.fixtures.${name}" must be ${hashes[name] ?? "a hash"}, the SHA-256 of the admin's tests/fixtures/${name}: ${FIXTURE_FLOW}.`,
  );
  const unknown = Object.keys(given)
    .filter((name) => !SHARED_FIXTURES.includes(name))
    .map((name) => `"$policy.fixtures.${name}" isn't a shared fixture (SHARED_FIXTURES in ${CONTRACT}).`);
  return [...wrong, ...unknown];
}

/**
 * Problems with the contract keys of a manifest's "$policy" (`policy`), in
 * the manifest's order; `fixtureHashes` are those of the admin's copies of
 * the shared fixtures. A missing key is as wrong as a different one.
 */
export function manifestContractProblems(policy: Record<string, unknown>, fixtureHashes: FixtureHashes): string[] {
  return [
    ...patternProblems(policy.patterns),
    ...VALUE_CHECKS.filter(({ key, isSame }) => !isSame(policy[key])).map(({ key, expected }) => `"$policy.${key}" must be ${expected}.`),
    ...pushProblems(policy.push),
    ...fixtureProblems(policy.fixtures, fixtureHashes),
  ];
}

/** A prop's spec in the manifest: a type, and optionally whether it's required and its options. */
function propSpecProblems(at: string, prop: unknown): string[] {
  if (!isObject(prop)) {
    return [`${at} must be an object.`];
  }
  const { options } = prop;
  const checks: [boolean, string][] = [
    [typeof prop.type === "string" && prop.type !== "", `${at} needs a type.`],
    [prop.required === undefined || typeof prop.required === "boolean", `${at}: required must be true or false.`],
    [options === undefined || (Array.isArray(options) && options.every((option) => typeof option === "string")), `${at}: options must be a list of text.`],
  ];
  return checks.filter(([isFine]) => !isFine).map(([, message]) => message);
}

/** A block's spec in the manifest: its type, a name, whether it lists entries, and its props. */
export function blockSpecProblems(type: string, spec: unknown): string[] {
  const where = `Block "${type}"`;
  const typeProblems = BLOCK_TYPE.test(type) ? [] : [`${where}: the type must be lowercase letters, digits and _.`];
  if (!isObject(spec)) {
    return [...typeProblems, `${where} must be an object.`];
  }
  const shape = [
    ...(typeof spec.name === "string" && spec.name !== "" ? [] : [`${where} needs a name.`]),
    ...(spec.list === undefined || typeof spec.list === "boolean" ? [] : [`${where}: list must be true or false.`]),
  ];
  if (!isObject(spec.props)) {
    return [...typeProblems, ...shape, `${where} needs props as an object.`];
  }
  return [...typeProblems, ...shape, ...Object.entries(spec.props).flatMap(([name, prop]) => propSpecProblems(`${where}: prop "${name}"`, prop))];
}
