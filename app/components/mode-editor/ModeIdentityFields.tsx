import { useFormContext, useWatch } from "react-hook-form";

import { FormField } from "~/components/FormField";

interface ModeIdentityFieldsProps {
  /** New's id is generated from the name and may be typed; Edit's is the file's name. */
  stage: "new" | "edit";
}

/** A mode's name, description and id. */
export function ModeIdentityFields({ stage }: ModeIdentityFieldsProps) {
  const { register, control, formState: { errors } } = useFormContext<Record<string, unknown>>();
  const idValue = useWatch({ control, name: "id" });
  const message = (key: string) => {
    const text = errors[key]?.message;
    return typeof text === "string" ? text : undefined;
  };
  const isNew = stage === "new";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="Name" placeholder="e.g. Payload" {...register("name")} error={errors.name !== undefined} helperText={message("name")} />
      <FormField label="Description (optional)" placeholder="A short summary" {...register("description")} error={errors.description !== undefined} helperText={message("description")} />
      <FormField
        label={isNew ? "Generated ID" : "ID (Read Only)"}
        placeholder={isNew ? "payload" : undefined}
        disabled={!isNew}
        {...register("id")}
        error={errors.id !== undefined}
        helperText={message("id")}
        slotProps={{ inputLabel: { shrink: idValue ? true : undefined } }}
      />
    </div>
  );
}
