// Where a screen's actions lead, with the game's other screens. A detail
// screen shows the record it's opened with, found by id among its own
// category's records (zms ScreenView), so only a list block of that
// category's records can open it (F9). A category's detail screen is its only
// one: with two, notifications and reference links open neither (C9; zms
// detailScreenFor and resolvePushTarget, reference-labels.ts detailScreenFor).

/** A screen of the game, as far as its actions need it: its id (file name), type and source. */
export interface ScreenRef {
  id: string;
  type?: unknown;
  source?: unknown;
}

/** The block an action is on, for detailActionProblem. */
export interface ActionOrigin {
  /** What names the action in a message: "action", "Tile 2". */
  what: string;
  /** Whether the block lists entries (a list block of the manifest). */
  isList: boolean;
  /** Its `items` binding, when it lists the entries of a record's field. */
  items?: unknown;
  /** The category of the records it lists: its own source's, else the screen's. */
  category?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The category a source names, if any. */
export const sourceCategory = (source: unknown): string | undefined =>
  isObject(source) && typeof source.category === "string" && source.category !== "" ? source.category : undefined;

/** Why a block can't open `target`, a detail screen of `shows` records, with the record that was tapped. */
function originProblem(origin: ActionOrigin, target: string, shows: string): string | undefined {
  if (!origin.isList) {
    return `${origin.what} opens "${target}", a detail screen: only a list of "${shows}" records can open it, with the record that was tapped.`;
  }
  if (typeof origin.items === "string" && origin.items.startsWith("data.")) {
    return `${origin.what} opens "${target}", a detail screen: this block lists the entries of ${origin.items}, not "${shows}" records.`;
  }
  if (origin.category !== undefined && origin.category !== "" && origin.category !== shows) {
    return `${origin.what} opens "${target}", which shows a "${shows}" record, but this block lists "${origin.category}" records: the app would find none.`;
  }
  return undefined;
}

/** Why an action that opens `target` can't show what was tapped, or undefined when it can. */
export function detailActionProblem(target: unknown, screens: readonly ScreenRef[], origin: ActionOrigin): string | undefined {
  if (typeof target !== "string") {
    return undefined;
  }
  const screen = screens.find((ref) => ref.id === target);
  const shows = screen?.type === "detail" ? sourceCategory(screen.source) : undefined;
  return shows === undefined ? undefined : originProblem(origin, target, shows);
}

/** The other detail screens that show what the detail screen `id` shows. */
export function otherDetailScreens(id: string, screens: readonly ScreenRef[]): string[] {
  const own = screens.find((ref) => ref.id === id);
  const category = own?.type === "detail" ? sourceCategory(own.source) : undefined;
  if (category === undefined) {
    return [];
  }
  return screens.filter((ref) => ref.id !== id && ref.type === "detail" && sourceCategory(ref.source) === category).map((ref) => ref.id);
}

/** The warning for a second detail screen of a category. */
export const secondDetailMessage = (other: string, category: string): string =>
  `The detail screen "${other}" shows "${category}" records too: notifications and reference links open neither of them. List blocks can still open either.`;
