import type { ScreenBlock } from "~/lib/screen-model";

// What the screen editor's block operations (useBlockEditing) work out
// without React: a block's props after an edit, the JSON boxes still broken,
// and where focus goes after a block moved or went.

/** The id of the element focus goes to after a block moved to `target`: the arrow it moved with, or at an end (where that one is off) the other. */
export function focusAfterMove({ blockId, target, delta, count }: { blockId: string; target: number; delta: -1 | 1; count: number }): string {
  const isEdge = target === 0 || target === count - 1;
  const arrow = isEdge === delta < 0 ? "down" : "up";
  return `block-${blockId}-${arrow}`;
}

/** The id of the element focus goes to after the block at `index` was removed: the next block's toggle, else the previous one's, else the add button. */
export function focusAfterRemove(blocks: readonly ScreenBlock[], index: number): string {
  if (index + 1 < blocks.length) {
    return `block-${blocks[index + 1].id}-toggle`;
  }
  return index > 0 ? `block-${blocks[index - 1].id}-toggle` : "add-block-button";
}

/** The block with prop `name` set to `value` in its place (a new one last), or removed when `value` is undefined. */
export function withProp(block: ScreenBlock, name: string, value: unknown): ScreenBlock {
  const props = { ...block.props };
  if (value === undefined) {
    Reflect.deleteProperty(props, name);
  } else {
    props[name] = value;
  }
  return { ...block, props };
}

/** The JSON boxes still broken ("<block id>:<prop>": error) after one reported `error`, or that it parses (null); the same object when nothing changed. */
export function reportedJson(errors: Record<string, string>, { key, error }: { key: string; error: string | null }): Record<string, string> {
  if (error !== null) {
    return errors[key] === error ? errors : { ...errors, [key]: error };
  }
  return key in errors ? Object.fromEntries(Object.entries(errors).filter(([entry]) => entry !== key)) : errors;
}

/** The JSON boxes still broken once a block is gone: none of its own. */
export function withoutBlockErrors(errors: Record<string, string>, blockId: string): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !key.startsWith(`${blockId}:`)));
}
