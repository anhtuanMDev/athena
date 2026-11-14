import { isCategoryFolderFormat } from "./categories";
import { SAFE_ENTITY_ID, SAFE_SLUG } from "./safe-path";

// Deleting a record deleted only its JSON, so its pictures stayed in the data
// repository for good. A record's pictures are the files under its own folder,
// public/assets/{game}/{folder}/{id}/ (portraits, ability icons, an enum's
// option icons): the editors write nowhere else for it, and no other record's
// folder starts with it. The delete page removes them in the same commit,
// except any that another record still points at.
//
// Who checks what: the page reads every record of the game to find those
// pointers (a Function on the Workers Free plan couldn't); the server only lets
// a delete remove the record's own folder, exactly the files the page showed,
// as they were when the page was opened (deletionConflict).

const FILE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

export interface AssetFile {
  path: string;
  sha: string;
}

/** The folder whose files are the record's own, ending in "/". */
export function recordAssetDir(game: string, folder: string, id: string): string {
  return `public/assets/${game}/${folder}/${id}/`;
}

/** Whether `path` is a file in (or under) `dir`. */
export function isOwnedAsset(path: string, dir: string): boolean {
  return path.startsWith(dir) && path.slice(dir.length).split("/").every((part) => FILE.test(part) && part !== "..");
}

/** A record as the delete page read it: where it is, and what it holds. */
export interface ScannedRecord {
  /** Its folder ("heroes", "screens"), or the file's path for a lone file ("data/_meta/games.json"). */
  folder: string;
  id: string;
  content: unknown;
}

/** Every string of `value`, keys included, at any depth. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      strings(item, out);
    }
  }
  return out;
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Which of `files` (all under `dir`) a text points at. Records point at a
 * picture as "/api/assets/<path>", "assets/<path>" or a full URL, maybe with
 * ?v=… or %-encoded; all hold <path> once decoded. A text naming the folder
 * itself, or a folder in it, points at every file under it.
 */
function pointedAt(text: string, dir: string, files: string[]): string[] {
  const rel = dir.slice("public/assets/".length);
  const plain = decoded(text);
  const hits = new Set<string>();
  for (let at = plain.indexOf(rel); at !== -1; at = plain.indexOf(rel, at + 1)) {
    const rest = /^[^?#\s"'<>()]*/.exec(plain.slice(at + rel.length))![0];
    const target = dir + rest;
    for (const file of files) if (file === target || ((rest === "" || rest.endsWith("/")) && file.startsWith(target))) hits.add(file);
  }
  return [...hits];
}

export interface DeletionPlan {
  /** Pictures only the record used: deleted with it. */
  remove: AssetFile[];
  /** Pictures another record points at: left in place, with who uses them. */
  keep: (AssetFile & { usedBy: string[] })[];
}

/** Which of `files` (all under `dir`) `records` point at: those go in `keep`, with who uses them. */
function planFor(dir: string, files: AssetFile[], records: ScannedRecord[]): DeletionPlan {
  const usedBy = new Map<string, string[]>();
  const paths = files.map((f) => f.path);
  for (const record of records) {
    const label = record.folder.includes("/") ? record.folder : `${record.folder}/${record.id}`;
    const hits = new Set(strings(record.content).flatMap((text) => pointedAt(text, dir, paths)));
    for (const path of hits) usedBy.set(path, [...(usedBy.get(path) ?? []), label]);
  }
  return {
    remove: files.filter((f) => !usedBy.has(f.path)),
    keep: files.filter((f) => usedBy.has(f.path)).map((f) => ({ ...f, usedBy: usedBy.get(f.path)! })),
  };
}

/** What deleting the record `folder/id` does to the files in its folder, given every other record of its game. */
export function deletionPlan(dir: string, files: AssetFile[], records: ScannedRecord[], self: { folder: string; id: string }): DeletionPlan {
  return planFor(dir, files, records.filter((record) => !(record.folder === self.folder && record.id === self.id)));
}

// ─── After a save ───────────────────────────────────────────────────────
// A save that replaces a picture under another name (portrait_2d.webp by
// portrait_2d.png), drops one, or renames an ability, left the old file for
// good. After the record is saved, its editor names the files of the record's
// own folder that the save stopped pointing at (droppedAssets); the server
// deletes those that nothing, the saved record included, points at
// (prunePlan), at one commit it read everything at. Nothing it can't check is
// deleted, and the save itself never waits on it.

/** The files under `dir` that `content` names as a picture: "/api/assets/<path>", "assets/<path>" or a URL holding it, maybe with ?v=… or %-encoded. */
function namedFiles(content: unknown, dir: string): Set<string> {
  const rel = dir.slice("public/assets/".length);
  const named = new Set<string>();
  for (const text of strings(content)) {
    const plain = decoded(text);
    for (let at = plain.indexOf(rel); at !== -1; at = plain.indexOf(rel, at + 1)) {
      // Only right after "assets/": another game's "rival-overwatch/heroes/ana/" isn't this folder.
      if (plain.slice(Math.max(0, at - 7), at) !== "assets/") continue;
      const path = dir + /^[^?#\s"'<>()]*/.exec(plain.slice(at + rel.length))![0];
      if (isOwnedAsset(path, dir)) named.add(path);
    }
  }
  return named;
}

/** The files of the record's own folder (`dir`) that `stored` pointed at and `saved` doesn't: what a save leaves behind. */
export function droppedAssets(stored: unknown, saved: unknown, dir: string): string[] {
  const kept = namedFiles(saved, dir);
  return [...namedFiles(stored, dir)].filter((path) => !kept.has(path));
}

/** Of the files a save left behind, those no record points at (the saved one included) go; the others stay, with who uses them. */
export function prunePlan(dir: string, files: AssetFile[], records: ScannedRecord[]): DeletionPlan {
  return planFor(dir, files, records);
}

/** What an editor asks the server to remove after a save: files of the record's own folder. */
export interface PruneRequest {
  game: string;
  folder: string;
  id: string;
  paths: string[];
}

/** Files one save can ask to remove: a record's pictures, with room to spare. */
const MAX_PRUNE = 50;

/** `body` as a prune request, or why it isn't one (a 400). */
export function pruneRequest(body: unknown): PruneRequest | string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { game, folder, id, paths } = b;
  if (typeof game !== "string" || !SAFE_SLUG.test(game)) return "Invalid game.";
  if (typeof folder !== "string" || !isRecordFolder(folder)) return "Invalid folder.";
  if (typeof id !== "string" || !SAFE_ENTITY_ID.test(id)) return "Invalid id.";
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PRUNE || !paths.every((p) => typeof p === "string")) return `Name 1 to ${MAX_PRUNE} pictures.`;
  // An enum's option icons, as a record's pictures, live in its own folder: public/assets/{game}/enums/{enum}/.
  const dir = recordAssetDir(game, folder, id);
  const outside = (paths as string[]).find((p) => !isOwnedAsset(p, dir));
  if (outside) return `${outside} isn't in ${dir}, the record's own folder.`;
  if (new Set(paths).size !== paths.length) return "A picture is listed twice.";
  return { game, folder, id, paths: paths as string[] };
}

/** The server's answer: what it removed, and what it kept and why. */
export interface PruneResult {
  removed: string[];
  kept: { path: string; why: string }[];
}

/** The sentence an editor adds to its "saved" message; `kept` makes it a warning. */
export function pruneNote(result: PruneResult): { message: string; kept: boolean } {
  // Its path in the record's folder: public/assets/{game}/{folder}/{id}/<this>.
  const name = (path: string) => path.split("/").slice(5).join("/");
  const parts: string[] = [];
  if (result.removed.length === 1) parts.push(`Removed the replaced picture ${name(result.removed[0])}.`);
  else if (result.removed.length > 1) parts.push(`Removed ${result.removed.length} replaced pictures (${result.removed.map(name).join(", ")}).`);
  for (const { path, why } of result.kept) parts.push(`Kept the replaced picture ${name(path)}: ${why}.`);
  return { message: parts.join(" "), kept: result.kept.length > 0 };
}

/**
 * The records that use the record `folder/id` by its id: one holding it as a
 * value or a key, at any depth. A record's own top-level id isn't a use, so
 * a record of another folder with the same id counts only if it uses it.
 */
export function dependents(records: ScannedRecord[], self: { folder: string; id: string }): ScannedRecord[] {
  const uses = (value: unknown): boolean => {
    if (typeof value === "string") return value === self.id;
    if (Array.isArray(value)) return value.some(uses);
    if (value && typeof value === "object") return Object.entries(value).some(([key, item]) => key === self.id || uses(item));
    return false;
  };
  return records.filter((record) => {
    if (record.folder === self.folder && record.id === self.id) return false;
    if (!record.content || typeof record.content !== "object" || Array.isArray(record.content)) return uses(record.content);
    return Object.entries(record.content).some(([key, value]) => key === self.id || (key !== "id" && uses(value)));
  });
}

/** One folder (or file) as read, and whether every record in it could be read. */
export interface Listing {
  items: unknown[];
  complete: boolean;
}

/**
 * The records of `folders`, read with `load`. A folder that fails to load, or
 * loads only partly, makes the scan incomplete: what uses a record can't then
 * be known, and the page must not act as if nothing did.
 */
export async function scanRecords(folders: string[], load: (folder: string) => Promise<Listing>): Promise<{ records: ScannedRecord[]; unread: string[] }> {
  const results = await Promise.all(
    folders.map(async (folder) => {
      try {
        return { folder, listing: await load(folder) };
      } catch {
        return { folder, listing: { items: [], complete: false } };
      }
    }),
  );
  const records: ScannedRecord[] = [];
  const unread: string[] = [];
  for (const { folder, listing } of results) {
    if (!listing.complete) unread.push(folder);
    for (const item of listing.items) {
      const id = item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id : "";
      records.push({ folder, id, content: item });
    }
  }
  return { records, unread };
}

/** What the delete page asks the server to do: delete the record, and these pictures of its folder. */
export interface DeletionRequest {
  game: string;
  folder: string;
  id: string;
  /** The record file's sha, as the page loaded it. */
  sha: string;
  /** The data branch's commit when the page read the record's folder: anything committed since, and the page's check may be out of date. */
  head: string;
  remove: AssetFile[];
  /** The folder's other files, which the page showed as kept. */
  keep: string[];
}

/** Folders whose records may have pictures: the categories', and enums (option icons). */
const isRecordFolder = (folder: string) => folder === "enums" || isCategoryFolderFormat(folder);

/** `body` as a deletion request, or why it isn't one (a 400). */
export function deletionRequest(body: unknown): DeletionRequest | string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { game, folder, id, sha, head } = b;
  if (typeof game !== "string" || !SAFE_SLUG.test(game)) return "Invalid game.";
  if (typeof folder !== "string" || !isRecordFolder(folder)) return "Invalid folder.";
  if (typeof id !== "string" || !SAFE_ENTITY_ID.test(id)) return "Invalid id.";
  if (typeof sha !== "string" || !sha || typeof head !== "string" || !head) return "sha and head are required.";
  const dir = recordAssetDir(game, folder, id);
  const remove = Array.isArray(b.remove) ? b.remove : [];
  const keep = Array.isArray(b.keep) ? b.keep : [];
  if (remove.length === 0) return "No pictures to delete: delete the record's file alone.";
  const files = remove.filter((f): f is AssetFile => !!f && typeof f === "object" && typeof f.path === "string" && typeof f.sha === "string");
  if (files.length !== remove.length || !keep.every((p) => typeof p === "string")) return "Invalid pictures.";
  const paths = [...files.map((f) => f.path), ...(keep as string[])];
  const outside = paths.find((p) => !isOwnedAsset(p, dir));
  if (outside) return `${outside} isn't in ${dir}, the record's own folder.`;
  if (new Set(paths).size !== paths.length) return "A picture is listed twice.";
  return { game, folder, id, sha, head, remove: files, keep: keep as string[] };
}

/** The data repository as the server found it: its head, and the blob sha of each file it read. */
export interface Snapshot {
  head: string;
  files: Record<string, string>;
}

/** Why the request no longer matches the repository (a 409: the page must be reloaded), or null. */
export function deletionConflict(request: DeletionRequest, snapshot: Snapshot): string | null {
  const record = `data/${request.game}/${request.folder}/${request.id}.json`;
  const dir = recordAssetDir(request.game, request.folder, request.id);
  if (snapshot.head !== request.head) return "The data changed since you opened this page. Reload it to check again.";
  if (snapshot.files[record] !== request.sha) return "The record changed or was deleted since you opened this page. Reload it.";
  const now = Object.keys(snapshot.files).filter((p) => isOwnedAsset(p, dir)).sort();
  const confirmed = [...request.remove.map((f) => f.path), ...request.keep].sort();
  const same = now.length === confirmed.length && now.every((p, i) => p === confirmed[i]) && request.remove.every((f) => snapshot.files[f.path] === f.sha);
  return same ? null : "The record's pictures changed since you opened this page. Reload it.";
}

// ─── A save with its pictures ───────────────────────────────────────────
// A record's save and its new or replaced pictures land in one commit. Each
// picture is uploaded first, on its own, as a blob (pictureRequest), which
// commits nothing; the save then commits the record and the pictures by their
// blobs' shas (saveRequest). Both take only pictures of the record's own
// folder, as deletes and prunes do.

/** A record of a game: where its file and its pictures' folder are. */
interface RecordRef {
  game: string;
  folder: string;
  id: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** `b`'s record, or why it isn't one. */
function recordRef(b: Record<string, unknown>): RecordRef | string {
  const { game, folder, id } = b;
  if (typeof game !== "string" || !SAFE_SLUG.test(game)) return "Invalid game.";
  if (typeof folder !== "string" || !isRecordFolder(folder)) return "Invalid folder.";
  if (typeof id !== "string" || !SAFE_ENTITY_ID.test(id)) return "Invalid id.";
  return { game, folder, id };
}

/** Why `path` can't be one of the record's pictures, or null: it must be a file of its own folder. */
function picturePathProblem(path: string, record: RecordRef): string | null {
  const dir = recordAssetDir(record.game, record.folder, record.id);
  return isOwnedAsset(path, dir) ? null : `${path} isn't in ${dir}, the record's own folder.`;
}

/** A picture to upload for a record's save: where it goes, and its bytes as base64. */
export interface PictureRequest extends RecordRef {
  path: string;
  base64: string;
}

/** `body` as a picture upload, or why it isn't one (a 400). Its bytes are the picture rules' to check (picture-rules.ts). */
export function pictureRequest(body: unknown): PictureRequest | string {
  const b = isPlainObject(body) ? body : {};
  const record = recordRef(b);
  if (typeof record === "string") return record;
  if (typeof b.path !== "string") return "Name the picture's path.";
  const outside = picturePathProblem(b.path, record);
  if (outside) return outside;
  if (typeof b.base64 !== "string") return "Send the picture as base64.";
  return { ...record, path: b.path, base64: b.base64 };
}

/** A picture a save commits: its path, the blob its upload made, and the token the upload gave for it. */
export interface SavedPicture {
  path: string;
  sha: string;
  token: string;
}

/** What a save asks the server to commit: the record, its pictures, or both. */
export interface SaveRequest extends RecordRef {
  /** The record file's sha as the editor loaded it; null for a new record, whose file mustn't exist yet. */
  sha: string | null;
  /** The record to write; undefined when the save changes pictures alone (the record must still be at `sha`). */
  content?: Record<string, unknown>;
  message: string;
  notify?: boolean;
  pictures: SavedPicture[];
}

/** Pictures one save can commit: a record's, with room to spare. */
export const MAX_SAVE_PICTURES = 50;
const BLOB_SHA = /^[0-9a-f]{40}$/;
/** What a picture's file may be called: what the picture rules take (picture-rules.ts). */
const PICTURE_FILE = /\.(png|jpe?g|webp)$/i;

/** `body` as a save, or why it isn't one (a 400). The pictures' tokens are the server's to check. */
export function saveRequest(body: unknown): SaveRequest | string {
  const b = isPlainObject(body) ? body : {};
  const record = recordRef(b);
  if (typeof record === "string") return record;
  const { content, message, notify } = b;
  const sha = b.sha === null || (typeof b.sha === "string" && BLOB_SHA.test(b.sha)) ? b.sha : undefined;
  if (sha === undefined) return "Invalid sha.";
  if (content !== undefined && !isPlainObject(content)) return "The record must be an object.";
  // The file's name is the record's id: the app and the push both go by it.
  if (content !== undefined && content.id !== record.id) return `The record's id must be "${record.id}", its file's name.`;
  if (content === undefined && sha === null) return "A new record needs its content.";
  if (message !== undefined && (typeof message !== "string" || !message.trim())) return "Invalid commit message.";
  if (notify !== undefined && typeof notify !== "boolean") return "Invalid notify.";
  const list = b.pictures ?? [];
  if (!Array.isArray(list) || list.length > MAX_SAVE_PICTURES) return `Save 0 to ${MAX_SAVE_PICTURES} pictures at once.`;
  const pictures: SavedPicture[] = [];
  for (const p of list) {
    if (!isPlainObject(p) || typeof p.path !== "string" || typeof p.sha !== "string" || !BLOB_SHA.test(p.sha) || typeof p.token !== "string") return "Invalid pictures.";
    const outside = picturePathProblem(p.path, record);
    if (outside) return outside;
    if (!PICTURE_FILE.test(p.path)) return `${p.path}: only PNG, JPEG and WebP pictures can be saved.`;
    pictures.push({ path: p.path, sha: p.sha, token: p.token });
  }
  if (new Set(pictures.map((p) => p.path)).size !== pictures.length) return "A picture is listed twice.";
  if (content === undefined && pictures.length === 0) return "Nothing to save.";
  return {
    ...record,
    sha,
    ...(content !== undefined && { content }),
    message: typeof message === "string" ? message : `Update ${record.folder}: ${record.id}`,
    ...(notify !== undefined && { notify }),
    pictures,
  };
}
