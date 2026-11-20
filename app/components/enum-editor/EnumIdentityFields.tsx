import { useFormContext, useWatch } from "react-hook-form";

import { FormField } from "~/components/FormField";

import type { GlobalEnum } from "~/schemas/enum";

interface EnumIdentityFieldsProps {
  /** New's id is generated from the name and may be typed; Edit's is the file's name. */
  stage: "new" | "edit";
}

/** An enum's name, id and description. */
export function EnumIdentityFields({ stage }: EnumIdentityFieldsProps) {
  const { register, control, formState: { errors } } = useFormContext<GlobalEnum>();
  const idValue = useWatch({ control, name: "id" });
  const isNew = stage === "new";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="Enum Name" placeholder="e.g. Damage Types" {...register("name")} error={errors.name !== undefined} helperText={errors.name?.message} />
      <FormField
        label={isNew ? "Generated ID" : "ID"}
        placeholder="damage-types"
        {...register("id")}
        error={errors.id !== undefined}
        helperText={errors.id?.message}
        disabled={!isNew}
        slotProps={isNew ? { inputLabel: { shrink: idValue ? true : undefined } } : undefined}
      />
      <div className="col-span-1 md:col-span-2">
        <FormField label="Description (optional)" placeholder="What is this list used for?" {...register("description")} error={errors.description !== undefined} helperText={errors.description?.message} />
      </div>
    </div>
  );
}
