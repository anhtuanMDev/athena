import { PREVIEW_ENTRIES } from "../utils/preview-data";

import { ReferenceValue } from "./ReferenceValue";

import type { ValueView } from "~/lib/screen-values";

interface FieldValuePreviewProps {
  view: ValueView;
}

/**
 * A field's value as field_section shows it (valueView, zms FieldValue): a
 * list of entries as cards, each sub-field a label and its value, references
 * by their records' labels.
 */
export function FieldValuePreview({ view }: FieldValuePreviewProps) {
  if (view.kind === "text") {
    return <ReferenceValue text={view.text} isLinked={Boolean(view.linked)} isChip={false} />;
  }
  if (view.kind === "chips") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {view.chips.map((chip, i) => (
          <ReferenceValue key={i} text={chip.text} isLinked={chip.linked} isChip />
        ))}
      </div>
    );
  }
  if (view.kind === "pairs") {
    return (
      <div className="space-y-0.5 text-xs">
        {view.pairs.map((pair, i) => (
          <p key={i}>{pair}</p>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {view.entries.slice(0, PREVIEW_ENTRIES).map((entry, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border bg-surface-raised p-2.5">
          {entry.title && <p className="text-sm font-bold">{entry.title}</p>}
          {entry.subtitle && <p className="text-[0.75rem] font-semibold uppercase text-primary-ink">{entry.subtitle}</p>}
          {entry.text && <p className="text-xs text-ink-muted">{entry.text}</p>}
          {entry.rows.map((row, j) => (
            <div key={j} className="flex gap-3 text-xs">
              <span className="w-28 shrink-0 text-ink-muted">{row.label}</span>
              <div className="min-w-0 flex-1">
                <FieldValuePreview view={row.value} />
              </div>
            </div>
          ))}
        </div>
      ))}
      {view.entries.length > PREVIEW_ENTRIES && <p className="text-xs text-ink-muted">and {view.entries.length - PREVIEW_ENTRIES} more</p>}
    </div>
  );
}
