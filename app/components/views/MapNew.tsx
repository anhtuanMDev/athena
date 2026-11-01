import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapSchema } from "~/schemas/map";
import { getFile, listDirectory, publishRecord } from "~/lib/github";
import {
  type DynamicSchemaFile,
  type DynamicField,
} from "~/schemas/dynamic-schema";
import { mapRecordSchema } from "~/lib/record-schema";
import { useData } from "~/lib/use-data";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";
import { publishedToast, useNotifyPlayers } from "~/components/NotifyPlayers";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import type { ImageEntry } from "~/components/MultiImageUploadField";

import type { Control, UseFormSetValue, FieldValues } from "react-hook-form";
import { slugify } from "~/lib/slug";
function AutoGenerateId({ control, setValue }: { control: Control<FieldValues>, setValue: UseFormSetValue<FieldValues> }) {
  const nameValue = useWatch({ control, name: "name" });
  
  useEffect(() => {
    if (nameValue && typeof nameValue === "string") {
      const generatedId = slugify(nameValue);
      setValue("id", generatedId, { shouldValidate: true, shouldDirty: true });
    }
  }, [nameValue, setValue]);

  return null;
}

export default function NewMap() {
  const { game } = useParams();
  assertSafeGameSlug(game!);

  const {
    data,
    loading,
    error: fetchError,
  } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(
      game!,
      "schemas",
      true,
    );
    const mapSchemas = schemas.filter((s) => s && s.category === "map");
    const allFields: DynamicField[] = [];
    for (const s of mapSchemas) {
      // Every map schema's fields, each key once (the form has one input per key).
      for (const f of s.fields ?? []) if (!allFields.some((g) => g.key === f.key)) allFields.push(f);
    }
    return { fields: allFields, schemaCount: mapSchemas.length, game: game! };
  }, [game], "MapNew-44");

  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const { notify, field: notifyField } = useNotifyPlayers("map");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // DynamicFieldsRenderer's ability pictures; map schemas have no ability lists today.
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>({});

  const dynamicZodSchema = useMemo(() => {
    if (!data) return MapSchema;
    return mapRecordSchema(data.fields);
  }, [data]);

  const methods = useForm({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onChange",
    defaultValues: {
      game: game!,
      id: "",
      name: "",
    },
  });
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid },
  } = methods;

  const onSubmit = async (formData: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // No input edits the legacy game_modes list, so a new map doesn't get one.
      const parsed = dynamicZodSchema.parse(formData);

      const exists = await getFile(`data/${game}/maps/${parsed.id}.json`);
      if (exists) {
        setSubmitError("A map with this ID already exists.");
        toastError("A map with this ID already exists.");
        setSubmitting(false);
        return;
      }
      const { push } = await publishRecord(
        `data/${game}/maps/${parsed.id}.json`,
        parsed,
        `Add map: ${parsed.name}`,
        notify,
      );
      publishedToast({ success: toastSuccess, warning: toastWarning }, `Map ${parsed.name} created successfully!`, push);
      navigate(`/${game}/maps`);
    } catch (err) {
      const msg = (err as Error).message;
      setSubmitError(msg);
      toastError(`Failed to create map: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-48 bg-border rounded-lg"></div>
        <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-12 bg-border rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (fetchError)
    return (
      <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
        <p>{String(fetchError)}</p>
      </div>
    );

  if (!data) return null;

  if (data.schemaCount === 0) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-ink">
              No Schema Configured
            </h3>
            <p className="text-sm text-ink-muted mt-2 mb-4">
              You must create a schema for Maps before adding entries.
            </p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>
              Create Schema
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">
            New Map - {game}
          </h1>
        </CardHeader>
        <CardContent>
          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">
              {submitError}
            </div>
          )}
          <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Top Actions */}
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg">
                {submitting ? "Creating..." : "Create Map"}
              </Button>
            </div>

            {notifyField}

            <AutoGenerateId control={control} setValue={setValue} />
            <input type="hidden" {...register("game")} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Name"
                placeholder="e.g. King's Row"
                {...register("name")}
                error={!!errors.name}
                helperText={errors.name?.message as string}
              />
              <FormField
                label="Generated ID"
                placeholder="kings-row"
                {...register("id")}
                error={!!errors.id}
                helperText={errors.id?.message as string}
                slotProps={{
                  htmlInput: { readOnly: false },
                }}
              />
            </div>

            {/* The schema's fields as every record form shows them: global enums, object lists, suffixes. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DynamicFieldsRenderer
                fields={data.fields}
                game={game!}
                abilityIcons={abilityIcons}
                setAbilityIcons={setAbilityIcons}
                control={control}
                register={register}
                errors={errors}
                skipFields={["id", "name"]}
              />
            </div>

            <div className="pt-4 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/${game}/maps`)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !isValid}
                className="shadow-lg"
              >
                {submitting ? "Creating..." : "Create Map"}
              </Button>
            </div>
          </form>
          </FormProvider>
        </CardContent>
      </Card>
    </div>
  );
}
