import { Trash2 } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

import { FormField } from "~/components/FormField";
import { Button } from "~/components/ui/button";

import { useOptionIdFollowsLabel } from "./hooks/useOptionIdFollowsLabel";
import { OptionIconField } from "./OptionIconField";
import { OptionParamsEditor } from "./OptionParamsEditor";
import { optionPath } from "./utils/fieldPaths";

import type { PickedIcon } from "~/lib/enum-icons";
import type { GlobalEnum } from "~/schemas/enum";

interface EnumOptionRowProps {
  index: number;
  /** The form's key for the option, which follows it when options move. */
  fieldKey: string;
  stage: "new" | "edit";
  /** Saved with the enum: its id is what records store, so it never follows the label. */
  isLoaded: boolean;
  onIconPick: (key: string, file: PickedIcon | null) => void;
  onRemove: (index: number) => void;
}

/** One option: its label, value, description, icon and params. */
export function EnumOptionRow({ index, fieldKey, stage, isLoaded, onIconPick, onRemove }: EnumOptionRowProps) {
  const { register, control, getFieldState, formState } = useFormContext<GlobalEnum>();
  const idValue = useWatch({ control, name: optionPath(index, "id") });
  useOptionIdFollowsLabel(index, isLoaded);
  // A field's register props, and its error and message when the check refused it.
  const field = (key: "name" | "id" | "description") => {
    const { error } = getFieldState(optionPath(index, key), formState);
    return { ...register(optionPath(index, key)), error: error !== undefined, helperText: error?.message };
  };
  return (
    <div className="flex gap-3 items-start p-3 bg-surface border border-border rounded-lg">
      <div className="flex-1 grid grid-cols-1 gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Label (Name)" placeholder="e.g. Hitscan" {...field("name")} />
          <FormField label="Value (ID)" placeholder={stage === "new" ? "e.g. hitscan (auto-generates if empty)" : "e.g. hitscan"} {...field("id")} slotProps={{ inputLabel: { shrink: idValue ? true : undefined } }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <FormField label="Description" placeholder="Optional description" {...field("description")} />
          </div>
          <OptionIconField index={index} fieldKey={fieldKey} onIconPick={onIconPick} />
        </div>
        <OptionParamsEditor optionIndex={index} />
      </div>
      <Button type="button" variant="ghost" onClick={() => { onRemove(index); }} aria-label="Remove option" className="mt-6 text-ink-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
        <Trash2 aria-hidden="true" className="w-4 h-4" />
      </Button>
    </div>
  );
}
