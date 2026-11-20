import { useEffect } from "react";
import { useWatch } from "react-hook-form";

import { slugify } from "./slug";

import type { UseFormReturn } from "react-hook-form";

/**
 * A new record's id follows its name until the id is edited (its field
 * touched). A `keptId`, such as the file's name in Edit or an id an AI
 * import gave, holds it: the name doesn't move it.
 */
export function useAutoGenerateId(form: UseFormReturn<Record<string, unknown>>, keptId?: string): void {
  const { control, setValue, getValues, formState } = form;
  // Only a new name moves the id: typing in the id itself must not set it back.
  const nameValue = useWatch({ control, name: "name" });
  const isHeld = formState.touchedFields.id === true || (keptId !== undefined && keptId !== "");

  useEffect(() => {
    if (typeof nameValue !== "string" || nameValue === "" || isHeld) {
      return;
    }
    const generatedId = slugify(nameValue);
    if (getValues("id") !== generatedId) {
      setValue("id", generatedId, { shouldValidate: true, shouldDirty: true });
    }
  }, [nameValue, isHeld, setValue, getValues]);
}
