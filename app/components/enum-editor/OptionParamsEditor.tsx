import { Plus } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "~/components/ui/button";

import { ParamRow } from "./ParamRow";
import { optionPath } from "./utils/fieldPaths";

import type { GlobalEnum } from "~/schemas/enum";

interface OptionParamsEditorProps {
  optionIndex: number;
}

/** An option's params: predefined values a record using the option gets. */
export function OptionParamsEditor({ optionIndex }: OptionParamsEditorProps) {
  const { control } = useFormContext<GlobalEnum>();
  const { fields, append, remove } = useFieldArray({ control, name: optionPath(optionIndex, "params") });
  // The params the enum was saved with: their ids are stored values, so they never follow a label.
  const [loadedParams] = useState(() => new Set(fields.map((param) => param.id)));
  return (
    <div className="space-y-3 mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-ink">Sub-Field Params</label>
          <p className="text-xs text-ink-muted">Add predefined parameters for this enum option.</p>
        </div>
        <Button type="button" size="small" variant="outline" onClick={() => { append({ id: "", label: "", value: "", suffix: "", type: "string" }); }} className="h-8 text-xs px-3">
          <Plus className="w-3 h-3 mr-1" /> Add Param
        </Button>
      </div>
      {fields.length === 0 && (
        <div className="text-xs text-ink-muted italic bg-surface-raised p-4 rounded-lg border border-dashed border-border text-center">No custom parameters defined for this option.</div>
      )}
      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <ParamRow key={field.id} optionIndex={optionIndex} index={index} isLoaded={loadedParams.has(field.id)} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  );
}
