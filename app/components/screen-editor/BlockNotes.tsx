import { AlertTriangle } from "lucide-react";

import { Button } from "~/components/ui/button";

import type { ScreenIssue } from "~/lib/screen-model";

interface BlockNotesProps {
  /** Problems no prop field shows: block-wide ones, and props outside the form. */
  notes: ScreenIssue[];
  /** Props the block doesn't have, which the app ignores. */
  strayProps: string[];
  onRemoveProps: (names: string[]) => void;
}

/** A block's problems no prop field shows, and a button that drops the props the app ignores. */
export function BlockNotes({ notes, strayProps, onRemoveProps }: BlockNotesProps) {
  return (
    <>
      {notes.map((note) => (
        <p key={note.message} className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${note.level === "error" ? "bg-danger/10 text-danger-ink" : "bg-surface-raised text-ink"}`}>
          <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {note.message}
        </p>
      ))}
      {strayProps.length > 0 && (
        <Button type="button" variant="ghost" size="small" onClick={() => onRemoveProps(strayProps)}>
          Remove {strayProps.join(", ")}
        </Button>
      )}
    </>
  );
}
