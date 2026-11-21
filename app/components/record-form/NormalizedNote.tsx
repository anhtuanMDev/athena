import type { NormalizedField } from "~/lib/form-defaults";

interface NormalizedNoteProps {
  fields: NormalizedField[];
}

/** A value as the note shows it: JSON, or "(none)" for a key the record didn't have. */
const shown = (value: unknown) => (value === undefined ? "(none)" : JSON.stringify(value));

/** A review's note of what the save normalizes: stored values the form converts, written with the user's edits but not theirs. */
export function NormalizedNote({ fields }: NormalizedNoteProps) {
  if (fields.length === 0) {
    return null;
  }
  return (
    <div role="note" className="space-y-1 rounded-md border border-border bg-surface-raised p-3">
      <h3 className="text-sm font-semibold text-ink">Normalized on save ({fields.length})</h3>
      <p className="text-xs text-ink-muted">Stored values the form converts to their field&apos;s type. This save writes them too, but they aren&apos;t your edits.</p>
      <ul className="space-y-0.5 text-xs text-ink-muted">
        {fields.map((field) => (
          <li key={field.path}>
            <code>{field.path}</code>: <code>{shown(field.from)}</code> → <code>{shown(field.to)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
