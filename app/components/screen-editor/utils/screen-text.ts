import { isBinding, type ScreenBlock } from "~/lib/screen-model";

// How the screen editor names a screen, a block's props and their problems.

/** Props a block's row lists before the rest. */
const SUMMARY_PROPS = 3;

/** Characters of a prop's value a row shows. */
const SUMMARY_TEXT = 24;

/** A screen's name: its title, else its id. */
export function screenName(title: string | undefined, id: string): string {
  return title === undefined || title === "" ? id : title;
}

/** "1 problem", "2 problems". */
export function problemCount(count: number): string {
  return count === 1 ? "1 problem" : `${String(count)} problems`;
}

function propSummary([name, value]: [string, unknown]): string {
  if (isBinding(value)) {
    return `${name} ← ${value}`;
  }
  if (Array.isArray(value)) {
    return `${name}: ${String(value.length)} ${value.length === 1 ? "entry" : "entries"}`;
  }
  const text = typeof value === "string" ? `"${value}"` : JSON.stringify(value);
  const shown = text.length > SUMMARY_TEXT ? `${text.slice(0, SUMMARY_TEXT - 1)}…` : text;
  return `${name}: ${shown}`;
}

/** A block's first props as its row shows them: bound ones by their field, lists by their size. */
export function summarizeProps(block: ScreenBlock): string {
  const parts = Object.entries(block.props)
    .filter(([, value]) => value !== undefined && (typeof value !== "object" || Array.isArray(value) || isBinding(value)))
    .slice(0, SUMMARY_PROPS)
    .map(propSummary);
  return parts.length > 0 ? parts.join(" · ") : "No props set";
}

/** A record's option in the preview's record select: keyed by its id, else its place. */
export function optionKey(record: Record<string, unknown>, index: number): string {
  const key: unknown = record.id ?? index;
  return String(key);
}

/** What the preview says about its sample record: which one a detail screen shows, or that there is none. */
export function sampleNote(type: string, sampleLabel: string | undefined): string {
  if (type !== "detail") {
    return "";
  }
  return sampleLabel === undefined ? "No records of this category yet, so bound values appear as field names. " : `Showing ${sampleLabel}. `;
}

/** The preview's note on the blocks it leaves out. */
export function hiddenNote(hiddenCount: number): string {
  return ` ${String(hiddenCount)} hidden ${hiddenCount === 1 ? "block is" : "blocks are"} left out.`;
}
