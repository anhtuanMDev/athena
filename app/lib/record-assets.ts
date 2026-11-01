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

/** What deleting the record `folder/id` does to the files in its folder, given every other record of its game. */
export function deletionPlan(dir: string, files: AssetFile[], records: ScannedRecord[], self: { folder: string; id: string }): DeletionPlan {
  const usedBy = new Map<string, string[]>();
  const paths = files.map((f) => f.path);
  for (const record of records) {
    if (record.folder === self.folder && record.id === self.id) continue;
    const label = record.folder.includes("/") ? record.folder : `${record.folder}/${record.id}`;
    const hits = new Set(strings(record.content).flatMap((text) => pointedAt(text, dir, paths)));
    for (const path of hits) usedBy.set(path, [...(usedBy.get(path) ?? []), label]);
  }
  return {
    remove: files.filter((f) => !usedBy.has(f.path)),
    keep: files.filter((f) => usedBy.has(f.path)).map((f) => ({ ...f, usedBy: usedBy.get(f.path)! })),
  };
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
