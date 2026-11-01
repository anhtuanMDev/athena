import { useMemo, useState } from "react";
import { useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "~/components/ui/card";
import { FormField } from "~/components/FormField";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import { type ImageEntry } from "~/components/MultiImageUploadField";
import { buildDynamicZodSchema, type DynamicField } from "~/schemas/dynamic-schema";

/**
 * A record of a dynamic schema, edited in that schema's own form: its id,
 * then each field. Used where no category has a form of its own (news) and
 * for import drafts of any category.
 */

const RECORD_ID = /^(?!.*\.\.)[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/;

/** A react-hook-form for `fields` plus an id, validated like the other entity editors. */
export function useRecordForm(fields: DynamicField[], defaultValues: Record<string, unknown>) {
  const schema = useMemo(
    () =>
      buildDynamicZodSchema(
        fields,
        z.object({ id: z.string().regex(RECORD_ID, "Lowercase letters, digits, dots and dashes") }),
        ["id"],
      ).strict(),
    [fields],
  );
  return useForm<Record<string, unknown>>({ resolver: zodResolver(schema), mode: "onChange", defaultValues });
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** The values a record keeps: no empty text, empty lists or unset fields, in its entries too. */
export function compact(values: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(values).map(([k, v]): [string, unknown] => [
    k,
    Array.isArray(v) ? v.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? compact(item as Record<string, unknown>) : item)) : v,
  ]);
  return Object.fromEntries(entries.filter(([, v]) => !isEmpty(v)));
}

/** The id and fields of the surrounding FormProvider's record, with a summary of what to fix. */
export function RecordFields({
  fields,
  game,
  idLocked = false,
  idHelp,
  action,
}: {
  fields: DynamicField[];
  game: string;
  /** Saved records keep their id: it's their file name. */
  idLocked?: boolean;
  idHelp: string;
  /** What the summary asks fixes before, e.g. "publishing". */
  action: string;
}) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<Record<string, unknown>>();
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>({});
  const errorEntries = Object.entries(errors);

  return (
    <>
      <Card>
        <CardContent className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Record ID"
              required
              slotProps={{ htmlInput: { readOnly: idLocked } }}
              {...register("id")}
              error={!!errors.id}
              helperText={(errors.id?.message as string) ?? idHelp}
            />
            <div className="hidden md:block" />
            <DynamicFieldsRenderer
              fields={fields}
              game={game}
              abilityIcons={abilityIcons}
              setAbilityIcons={setAbilityIcons}
              control={control}
              register={register}
              errors={errors}
              skipFields={["id"]}
            />
          </div>
        </CardContent>
      </Card>

      {errorEntries.length > 0 && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
          <h4 className="text-sm font-bold text-red-800 dark:text-red-400 mb-2">Fix these before {action}:</h4>
          <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
            {errorEntries.map(([key, err]) => (
              <li key={key}>
                <strong>{key === "id" ? "Record ID" : fields.find((f) => f.key === key)?.label ?? key}:</strong>{" "}
                {(err?.message as string) || "Invalid value"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
