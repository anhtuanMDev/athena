import { useFormContext, useWatch } from "react-hook-form";

import { FormField } from "~/components/FormField";

interface HeroIdentityFieldsProps {
  /** New's id is generated from the name and may be typed; Edit's is the file's name, not shown. */
  stage: "new" | "edit";
}

/** A hero's name, real name and (New) id. */
export function HeroIdentityFields({ stage }: HeroIdentityFieldsProps) {
  const { register, control, formState: { errors } } = useFormContext<Record<string, unknown>>();
  const idValue = useWatch({ control, name: "id" });
  const message = (key: string) => {
    const text = errors[key]?.message;
    return typeof text === "string" ? text : undefined;
  };
  const isNew = stage === "new";
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label={isNew ? "Agent Code Name" : "Name"} placeholder={isNew ? "e.g. Tracer" : undefined} {...register("name")} error={errors.name !== undefined} helperText={message("name")} />
      <FormField label="Real Fullname (optional)" placeholder="e.g. Lena Oxton" {...register("real_name")} error={errors.real_name !== undefined} helperText={message("real_name")} />
      {isNew && <FormField label="Generated ID" placeholder="tracer" {...register("id")} error={errors.id !== undefined} helperText={message("id")} slotProps={{ inputLabel: { shrink: idValue ? true : undefined } }} />}
    </div>
  );
}
