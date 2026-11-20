import { Plus } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { Button } from "~/components/ui/button";

import { EnumOptionRow } from "./EnumOptionRow";

import type { UseFieldArrayReturn } from "react-hook-form";
import type { PickedIcon } from "~/lib/enum-icons";
import type { GlobalEnum } from "~/schemas/enum";

interface EnumOptionsProps {
  stage: "new" | "edit";
  options: UseFieldArrayReturn<GlobalEnum, "options">;
  /** The keys of the options the enum was saved with. */
  loadedOptions: ReadonlySet<string>;
  onIconPick: (key: string, file: PickedIcon | null) => void;
}

/** The enum's options: new ones go on top. */
export function EnumOptions({ stage, options, loadedOptions, onIconPick }: EnumOptionsProps) {
  const { formState: { errors } } = useFormContext<GlobalEnum>();
  const listError = errors.options?.message;
  return (
    <div className="border border-border rounded-xl p-4 bg-surface-raised">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-ink">Options</h3>
          <p className="text-xs text-ink-muted">The values that will be selectable in the schema.</p>
        </div>
        <Button type="button" size="small" variant="outline" onClick={() => { options.prepend({ id: "", name: "", description: "" }); }}>
          <Plus className="w-4 h-4 mr-2" /> Add Option
        </Button>
      </div>
      {typeof listError === "string" && <div className="text-sm text-red-500 mb-4">{listError}</div>}
      <div className="space-y-3">
        {options.fields.map((field, index) => (
          <EnumOptionRow key={field.id} index={index} fieldKey={field.id} stage={stage} isLoaded={loadedOptions.has(field.id)} onIconPick={onIconPick} onRemove={options.remove} />
        ))}
        {options.fields.length === 0 && (
          <div className="text-center py-6 text-sm text-ink-muted italic border-2 border-dashed border-border rounded-lg">No options added. Click &quot;Add Option&quot; to begin.</div>
        )}
      </div>
    </div>
  );
}
