/**
 * How the admin asks for a folder's records (GET /api/data/directory), kept
 * apart from github.ts and use-entity-list.ts so tests can check it without
 * React.
 */

/**
 * What a listing carries of each record: the whole record (none), or a
 * summary, what a list shows (record-columns.ts listSummary). Lists ask for
 * summaries: 80 filled heroes are 158 KB that way, and 1.7 MB whole.
 */
export type ListShape = "summary";

/** The API path of a folder listing: its records' names, or with includeContent their content, whole, by keysOnly, or by shape. */
export function directoryPath(game: string, subpath: string, options: { includeContent?: boolean; keysOnly?: string[]; shape?: ListShape } = {}): string {
  let path = `data/directory?game=${encodeURIComponent(game)}&subpath=${encodeURIComponent(subpath)}`;
  if (options.includeContent) path += "&includeContent=true";
  if (options.keysOnly && options.keysOnly.length > 0) path += `&keysOnly=${encodeURIComponent(options.keysOnly.join(","))}`;
  if (options.shape) path += `&shape=${options.shape}`;
  return path;
}

/** The page cache's key for a folder's list (useData): one per shape, so a list of summaries never stands in for whole records. */
export function entityListKey(game: string, folder: string, shape?: ListShape): string {
  return shape ? `${game}-${folder}-list-${shape}` : `${game}-${folder}-list`;
}
