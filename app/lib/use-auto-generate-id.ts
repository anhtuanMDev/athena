import { useEffect } from "react";
import { useWatch } from "react-hook-form";

import { idFromName } from "./record-form";

import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

/**
 * A new record's id follows its name until the id is edited (its field
 * touched). A `keptId`, such as the file's name in Edit or an id an AI
 * import gave, holds it: the name doesn't move it (idFromName).
 */
export function useAutoGenerateId<T extends FieldValues>(form: UseFormReturn<T>, keptId?: string): void {
  const { control, setValue, getValues, getFieldState, formState } = form;
  const idPath = "id" as Path<T>;
  // Only a new name moves the id: typing in the id itself must not set it back.
  const name: unknown = useWatch({ control, name: "name" as Path<T> });
  const generatedId = idFromName({ name, isTouched: getFieldState(idPath, formState).isTouched, keptId });

  useEffect(() => {
    if (generatedId !== null && getValues(idPath) !== generatedId) {
      setValue(idPath, generatedId as PathValue<T, Path<T>>, { shouldValidate: true, shouldDirty: true });
    }
  }, [generatedId, idPath, setValue, getValues]);
}
