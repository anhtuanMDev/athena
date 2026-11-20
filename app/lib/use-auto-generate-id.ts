import { useEffect } from "react";
import { useWatch } from "react-hook-form";

import { slugify } from "./slug";

import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

/**
 * A new record's id follows its name until the id is edited (its field
 * touched). A `keptId`, such as the file's name in Edit or an id an AI
 * import gave, holds it: the name doesn't move it.
 */
export function useAutoGenerateId<T extends FieldValues>(form: UseFormReturn<T>, keptId?: string): void {
  const { control, setValue, getValues, getFieldState, formState } = form;
  const idPath = "id" as Path<T>;
  // Only a new name moves the id: typing in the id itself must not set it back.
  const nameValue: unknown = useWatch({ control, name: "name" as Path<T> });
  const isHeld = getFieldState(idPath, formState).isTouched || (keptId !== undefined && keptId !== "");

  useEffect(() => {
    if (typeof nameValue !== "string" || nameValue === "" || isHeld) {
      return;
    }
    const generatedId = slugify(nameValue);
    if (getValues(idPath) !== generatedId) {
      setValue(idPath, generatedId as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });
    }
  }, [nameValue, isHeld, idPath, setValue, getValues]);
}
