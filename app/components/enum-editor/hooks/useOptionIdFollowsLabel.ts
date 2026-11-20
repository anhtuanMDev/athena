import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { slugify } from "~/lib/slug";

import { optionPath } from "../utils/fieldPaths";

import type { GlobalEnum } from "~/schemas/enum";

/**
 * A new option's id follows its label until the id is edited. A saved
 * option's (`isLoaded`) never does: its id is what records store (modes say
 * "push").
 */
export function useOptionIdFollowsLabel(index: number, isLoaded: boolean): void {
  const { control, setValue, getValues, getFieldState, formState } = useFormContext<GlobalEnum>();
  // Only a new label moves the id: typing in the id itself must not set it back.
  const idPath = optionPath(index, "id");
  const label = useWatch({ control, name: optionPath(index, "name") });
  const isHeld = isLoaded || getFieldState(idPath, formState).isTouched;

  useEffect(() => {
    if (typeof label !== "string" || label === "" || isHeld) {
      return;
    }
    const generatedId = slugify(label);
    if (getValues(idPath) !== generatedId) {
      setValue(idPath, generatedId, { shouldValidate: true, shouldDirty: true });
    }
  }, [label, isHeld, idPath, setValue, getValues]);
}
