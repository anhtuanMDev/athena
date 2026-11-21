import { inputClass } from "~/components/ui/input-classes";

/** A box of raw JSON. */
export const monoInputClass = `${inputClass} font-mono text-xs leading-5`;

/** Rows a JSON box shows. */
export const JSON_ROWS = 3;

/** A row's move and remove buttons. */
export const smallButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

/** The button that adds a tile or a row. */
export const addButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:hover:bg-transparent";
