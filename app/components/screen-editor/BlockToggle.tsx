import { AlertTriangle, ChevronDown } from "lucide-react";

import { summarizeProps } from "./utils/screen-text";

import type { BlockPosition } from "./types";
import type { ScreenBlock } from "~/lib/screen-model";

interface BlockToggleProps {
  block: ScreenBlock;
  name: string;
  position: BlockPosition;
  isExpanded: boolean;
  /** Its errors, and whether it has block-wide warnings. */
  status: { errorCount: number; hasWarnings: boolean };
  onToggle: () => void;
}

/** A block's row: its name, its tab, its problems and its first props; opens its form. */
export function BlockToggle({ block, name, position, isExpanded, status, onToggle }: BlockToggleProps) {
  const isHidden = block.visible === false;
  const { errorCount } = status;
  return (
    <button
      type="button"
      id={`block-${block.id}-toggle`}
      aria-expanded={isExpanded}
      aria-controls={`block-${block.id}-body`}
      onClick={onToggle}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${isExpanded ? "" : "-rotate-90"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${isHidden ? "text-ink-muted" : "text-ink"}`}>
          {name}
          <span className="sr-only">, block {position.index + 1} of {position.count}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {isHidden && <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-ink-muted">Hidden</span>}
          {block.tab && <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-ink-muted">Tab: {block.tab}</span>}
          {errorCount > 0 && (
            <span className="shrink-0 rounded-full bg-danger/10 px-1.5 text-xs font-medium text-danger-ink">
              {errorCount} {errorCount === 1 ? "problem" : "problems"}
            </span>
          )}
          {errorCount === 0 && status.hasWarnings && <AlertTriangle aria-label="Has warnings" className="size-3.5 shrink-0 text-ink-muted" />}
          <span className="truncate font-mono text-xs text-ink-muted">{summarizeProps(block)}</span>
        </span>
      </span>
    </button>
  );
}
