import { Trash2 } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";

import { Button } from "~/components/ui/button";
import { paramIdFromLabel } from "~/lib/enum-form";

import { PARAM_INPUT } from "./constants";
import { ParamTypeValue } from "./ParamTypeValue";
import { paramPath } from "./utils/fieldPaths";

import type { GlobalEnum } from "~/schemas/enum";

interface ParamRowProps {
  optionIndex: number;
  index: number;
  /** Saved with the enum: its id never follows the label. */
  isLoaded: boolean;
  onRemove: (index: number) => void;
}

/** One param: its id (from a new one's label), label, type and value, and suffix. */
export function ParamRow({ optionIndex, index, isLoaded, onRemove }: ParamRowProps) {
  const { control, register, setValue, getFieldState, formState: { errors } } = useFormContext<GlobalEnum>();
  const paramErrors = errors.options?.[optionIndex]?.params?.[index];
  const path = paramPath(optionIndex, index);
  return (
    <div className="flex gap-3 items-start bg-surface-raised p-3 rounded-lg border border-border">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* A Controller, as the label's: a new param's focus goes to its first registered input (the suffix), not the id. */}
        <Controller
          control={control}
          name={`${path}.id`}
          render={({ field }) => (
            <div>
              <input aria-label="ID" {...field} placeholder="ID (e.g. damage_multiplier)" className={PARAM_INPUT} />
              {paramErrors?.id && <span className="text-xs text-red-500 block mt-1">{paramErrors.id.message}</span>}
            </div>
          )}
        />
        <Controller
          control={control}
          name={`${path}.label`}
          render={({ field }) => (
            <div>
              <input
                aria-label="Label"
                {...field}
                placeholder="Label (e.g. Damage Multiplier)"
                onChange={(event) => {
                  field.onChange(event);
                  if (!isLoaded && !getFieldState(`${path}.id`).isTouched) {
                    setValue(`${path}.id`, paramIdFromLabel(event.target.value), { shouldValidate: true, shouldDirty: true });
                  }
                }}
                className={PARAM_INPUT}
              />
              {paramErrors?.label && <span className="text-xs text-red-500 block mt-1">{paramErrors.label.message}</span>}
            </div>
          )}
        />
        <ParamTypeValue path={path} />
        <div>
          <input aria-label="Suffix" placeholder="Suffix (e.g. %)" {...register(`${path}.suffix`)} className={PARAM_INPUT} />
        </div>
      </div>
      <Button type="button" variant="ghost" onClick={() => { onRemove(index); }} aria-label="Remove parameter" className="text-ink-muted hover:text-red-500 p-2 h-auto">
        <Trash2 aria-hidden="true" className="w-4 h-4" />
      </Button>
    </div>
  );
}
