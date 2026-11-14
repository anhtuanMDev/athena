// Pictures in the data repo, for data-cross-checks.ts: an asset path a file
// names must be a file under public/assets (an error), and a record's picture
// on a host the app won't load is a warning (the app shows nothing for it).
//
// Imports no npm package: the data repo's CI runs it with Node alone.

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { refusedPicture } from "../app/lib/app-pictures";

import type { PicturePolicy } from "../app/lib/app-pictures";

export type Level = "error" | "warning";

/** Where a file's problems go. */
export type Report = (level: Level, message: string) => void;

/** Keys that hold a picture (screen-model.ts imageField): portrait, image, icon_url, banner… */
const PICTURE_KEY = /(^|_)(image|portrait|picture|photo|thumbnail|banner|icon|art)(_|$)/;
/** A picture the data repo holds itself: "/api/assets/<file>" or "assets/<file>". */
const ASSET_PATH = /^\/?(?:api\/)?assets\/([^?#]+)/;
const ABSOLUTE_URL = /^(https?:)?\/\//i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function collectFiles(dir: string, relative: string, found: Set<string>): void {
  for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectFiles(dir, path, found);
    } else if (entry.isFile()) {
      found.add(path);
    }
  }
}

/** Every file under public/assets of the repo at `root` (relative to it), not following links; none without the folder. */
export function assetFiles(root: string): Set<string> {
  const found = new Set<string>();
  const dir = join(root, "public/assets");
  if (lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    collectFiles(dir, "", found);
  }
  return found;
}

/** Where scanPictures reports, and what it checks against. */
export interface PictureScan {
  assets: ReadonlySet<string>;
  policy: PicturePolicy;
  /** Whether URLs at picture keys are checked against the app's picture hosts (screens and games.json have their own rule). */
  checksHosts: boolean;
  report: Report;
}

/** Where a value is in its file ("portrait.2d"), and whether it's under a picture key. */
interface Place {
  at: string;
  isPicture: boolean;
}

/** A whole file. */
export const ROOT_PLACE: Place = { at: "", isPicture: false };

/** A malformed escape names the file as written. */
function decodedName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch (error) {
    if (error instanceof URIError) {
      return name;
    }
    throw error;
  }
}

/** The file under public/assets an asset path names ("/api/assets/x.webp", "assets/x.webp"). */
function assetFile(value: string): string | undefined {
  const isAsset = value.startsWith("/api/assets/") || value.startsWith("assets/");
  const name = isAsset ? ASSET_PATH.exec(value)?.[1] : undefined;
  return name === undefined ? undefined : decodedName(name);
}

/** One text value: an asset path must name a file; a URL at a picture key must be one the app loads. */
function checkPictureText(value: string, place: Place, scan: PictureScan): void {
  const file = assetFile(value);
  if (file !== undefined) {
    if (!scan.assets.has(file)) {
      scan.report("error", `${place.at}: the picture ${value} doesn't exist.`);
    }
    return;
  }
  const isRefused = scan.checksHosts && place.isPicture && ABSOLUTE_URL.test(value) && refusedPicture(value, scan.policy) !== undefined;
  if (isRefused) {
    scan.report("warning", `${place.at}: the app won't load the picture ${value}.`);
  }
}

/** The values inside an array or object, each with its place. A picture key's object is a map of variants: each is a picture too. */
function childPlaces(value: unknown, place: Place): [unknown, Place][] {
  if (Array.isArray(value)) {
    return value.map((entry, index): [unknown, Place] => [entry, { at: `${place.at}[${String(index)}]`, isPicture: place.isPicture }]);
  }
  if (!isObject(value)) {
    return [];
  }
  return Object.entries(value).map(([key, entry]): [unknown, Place] => [
    entry,
    { at: place.at ? `${place.at}.${key}` : key, isPicture: place.isPicture || PICTURE_KEY.test(key) },
  ]);
}

/** Pictures and assets inside a parsed file. */
export function scanPictures(value: unknown, place: Place, scan: PictureScan): void {
  if (typeof value === "string") {
    checkPictureText(value, place, scan);
    return;
  }
  for (const [entry, child] of childPlaces(value, place)) {
    scanPictures(entry, child, scan);
  }
}
