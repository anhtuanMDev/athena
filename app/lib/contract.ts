// The contract with the mobile app (zms): the ids, slugs, colours, folders,
// picture hosts and push names both sides check the same way. zms keeps the
// same values in src/content/policy.ts, and its manifest generator writes them
// into the block manifest's "$policy" (patterns, reservedFolders,
// reservedCategories, imageVariants, assetVersionLength, push, fixtures), so a
// difference between the two shows up in CI (screen-policy.ts manifestProblems).
// The shared test fixtures (SHARED_FIXTURES) pin how both sides apply them.
//
// Import-free: the data validator (tools/validate-data.ts) runs with Node alone.
// Every pattern is a RegExp without flags; the manifest holds its `.source`.

/** A game's slug: 1–40 of a-z, 0-9 and -, starting and ending with a letter or digit. */
export const GAME_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** A record's id and file name: 1–80 of a-z, 0-9, . and -, starting and ending with a letter or digit, without "..". */
export const RECORD_ID = /^(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/;
/** A game screen's id (its file name). The app's own screens ("app:settings") are listed in appScreens instead. */
export const SCREEN_ID = /^[a-z0-9][a-z0-9-]*$/;
/** A category's name in categories.json. */
export const CATEGORY_NAME = /^[a-z][a-z0-9_]{0,39}$/;
/** A category's record folder. No "_", "." or "/": _meta, cron_jobs and ../x can't even be written. */
export const FOLDER_NAME = /^[a-z][a-z0-9-]{0,39}$/;
/** A schema field's key, and a field_key prop (filter chips' field). */
export const FIELD_KEY = /^[a-z0-9_]+$/;
/** A link read from a record: "data.<path>" on the screen's record, "item.<path>" on each entry of a list block. */
export const BOUND_LINK = /^(data|item)\.[A-Za-z0-9_.]+$/;
/** Every colour: a screen's accent, a block's colours, a game's palettes. */
export const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** Characters of a picture's ?v= in the mobile payloads: the start of its git blob hash. */
export const ASSET_VERSION_LENGTH = 12;
/** A ?v= value the mobile payloads write. */
export const ASSET_VERSION = /^[0-9a-f]{12}$/;

/** Folders of a game that aren't records, and the admin's own routes under a game (firestore.rules lists the same). */
export const RESERVED_FOLDERS = ["imports", "syncs", "schemas", "screens", "enums", "assets", "navigation", "cron", "raw"];
/** Schema categories that aren't records: import job definitions. */
export const RESERVED_CATEGORIES = ["cron_job"];

/** Picture hosts besides the API's own /api/assets: Blizzard's site art and news thumbnails. */
export const IMAGE_HOSTS = ["blz-contentstack-images.akamaized.net", "bnetcmsus-a.akamaihd.net"];
/** The variant a picture stored as { "main": …, "2d": … } shows: the first of these it has, else its first. */
export const IMAGE_VARIANTS = ["main", "default", "2d", "portrait", "icon"];

/** Every player who has notifications on (zms subscribes to it). */
export const PUSH_TOPIC = "all_users";
/** The Android notification channel zms creates at start-up. */
export const ANDROID_CHANNEL_ID = "default";

/** Test fixtures zms keeps byte-identical copies of (tests/fixtures here, __tests__/fixtures there). */
export const SHARED_FIXTURES = [
  "categories.json",
  "contract-cases.json",
  "contrast-cases.json",
  "palette-cases.json",
  "reference-folders-golden-items.json",
  "reference-folders-golden.json",
];
