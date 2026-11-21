import { Plus } from "lucide-react";

import type { PrimitiveManifest, PrimitiveSpec } from "~/lib/screen-model";

interface BlockPickerProps {
  manifest: PrimitiveManifest | null;
  isOpen: boolean;
  onToggle: () => void;
  onAdd: (type: string) => void;
}

/** What a block type needs, under its name in the picker. */
function requiredOf(spec: PrimitiveSpec): string[] {
  return Object.entries(spec.props)
    .filter(([, prop]) => prop.required && prop.type !== "node")
    .map(([name]) => name);
}

/** The Add block button, and the manifest's block types to pick from. */
export function BlockPicker({ manifest, isOpen, onToggle, onAdd }: BlockPickerProps) {
  return (
    <div className="mt-3">
      <button
        type="button"
        id="add-block-button"
        aria-expanded={isOpen}
        aria-controls="block-picker"
        onClick={onToggle}
        disabled={!manifest}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add block
      </button>
      {isOpen && manifest && (
        <ul id="block-picker" aria-label="Block types" className="mt-2 grid gap-2 rounded-xl border border-border bg-surface p-2 sm:grid-cols-2">
          {Object.entries(manifest).map(([type, spec]) => {
            const required = requiredOf(spec);
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => onAdd(type)}
                  className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="block text-sm font-medium text-ink">{spec.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {spec.list ? "Repeats per record · " : ""}
                    {required.length > 0 ? `Needs ${required.join(", ")}` : "No required props"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
