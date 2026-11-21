import { AlertTriangle } from "lucide-react";

import { PARTIAL_LOAD_REASON } from "~/lib/screen-save";

interface LoadFailuresNoteProps {
  /** The game's data that couldn't be read ("schemas", "heroes records"…). */
  failed: string[];
}

/** What the editor couldn't read: its checks and preview go without it, and it won't save. */
export function LoadFailuresNote({ failed }: LoadFailuresNoteProps) {
  if (failed.length === 0) {
    return null;
  }
  return (
    <div role="note" className="mt-6 flex gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm text-ink">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        Couldn&apos;t load {failed.join(", ")}. The checks and the preview go without {failed.length === 1 ? "it" : "them"}, so they may be
        wrong. {PARTIAL_LOAD_REASON}
      </p>
    </div>
  );
}
