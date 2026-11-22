import { useFormContext } from "react-hook-form";

import { FormField } from "~/components/FormField";

import type { MapStage } from "./types";

interface MapIdentityFieldsProps {
  /** New's id is generated from the name and may be typed; Edit's is the file's name. */
  stage: MapStage;
}

/** A map's game and name, and New's id. */
export function MapIdentityFields({ stage }: MapIdentityFieldsProps) {
  const { register, formState: { errors } } = useFormContext<Record<string, unknown>>();
  const message = (key: string) => {
    const text = errors[key]?.message;
    return typeof text === "string" ? text : undefined;
  };
  if (stage === "edit") {
    return (
      <>
        <input type="hidden" {...register("game")} />
        <input type="hidden" {...register("id")} />
        <FormField label="Name" {...register("name")} error={errors.name !== undefined} helperText={message("name")} />
      </>
    );
  }
  return (
    <>
      <input type="hidden" {...register("game")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Name" placeholder="e.g. King's Row" {...register("name")} error={errors.name !== undefined} helperText={message("name")} />
        <FormField label="Generated ID" placeholder="kings-row" {...register("id")} error={errors.id !== undefined} helperText={message("id")} slotProps={{ htmlInput: { readOnly: false } }} />
      </div>
    </>
  );
}
