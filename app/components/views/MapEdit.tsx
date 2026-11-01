import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapSchema, type Map } from "~/schemas/map";
import { getFile, updateFile, deleteFile, isConflictError, listDirectory } from "~/lib/github";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { mapRecordSchema } from "~/lib/record-schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { EmptyState } from "~/components/ui/EmptyState";
import { UnknownKeysNotice } from "~/components/UnknownKeysNotice";
import { keepUnknownKeys, unknownKeys } from "~/lib/unknown-keys";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import type { ImageEntry } from "~/components/MultiImageUploadField";

export default function EditMap() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const { data: fileData, loading: fileLoading, error: fileFetchError } = useData<{ content: Map; sha: string } | null>(
    () => getFile<Map>(`data/${game}/maps/${id}.json`),
    [game, id], "MapEdit-25"
  );

  const { data: schemaData, loading: schemaLoading, error: schemaFetchError } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const mapSchemas = schemas.filter(s => s && s.category === "map");
    const allFields: DynamicField[] = [];
    for (const s of mapSchemas) {
      // Every map schema's fields, each key once (the form has one input per key).
      for (const f of s.fields ?? []) if (!allFields.some((g) => g.key === f.key)) allFields.push(f);
    }
    return { fields: allFields, schemaCount: mapSchemas.length, game: game! };
  }, [game], "MapEdit-30");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // DynamicFieldsRenderer's ability pictures; map schemas have no ability lists today.
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>({});

  const dynamicZodSchema = useMemo(() => {
    if (!schemaData) return MapSchema;
    return mapRecordSchema(schemaData.fields);
  }, [schemaData]);

  const methods = useForm({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onChange",
  });
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isValid }
  } = methods;

  useEffect(() => {
    // The legacy game_modes list has no input, so it stays the list it was
    // (as text it failed the form's own check, and the map couldn't be saved).
    if (fileData?.content) reset({ ...fileData.content });
  }, [fileData, reset]);

  const onSubmit = async (formData: Record<string, unknown>) => {
    if (!fileData) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const parsed = dynamicZodSchema.parse(formData);

      // The map's keys stay in the stored file's order, and the form's cleared ones stay out.
      const saved = keepUnknownKeys(fileData.content as Record<string, unknown>, parsed, dynamicZodSchema);
      try {
        await updateFile(`data/${game}/maps/${id}.json`, saved, fileData.sha, `Update map: ${parsed.name}`);
        toastSuccess(`Map ${parsed.name} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setSubmitError(err.message);
          toastError(err.message);
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setSubmitError(msg);
      toastError(`Failed to save: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!fileData) return;
    if (!confirm("Are you sure you want to delete this map? This action cannot be undone.")) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      try {
        await deleteFile(`data/${game}/maps/${id}.json`, fileData.sha, `Delete map: ${id}`);
        toastSuccess("Map deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setSubmitError(err.message);
          toastError(err.message);
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setSubmitError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const loading = fileLoading || schemaLoading;

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

  if (fileFetchError || schemaFetchError) return (
    <LoadErrorState
      title="Failed to Load Map"
      error={fileFetchError || schemaFetchError}
      onBack={() => window.history.back()}
    />
  );

  if (!fileData || !schemaData) return (
    <div className="w-full py-12">
      <EmptyState
        title="Map or Schema Not Found"
        description="The map you are trying to edit could not be found or the required schema is missing."
        action={<Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>}
      />
    </div>
  );

  const m = fileData.content;

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">Edit Map: {m.name}</h1>
        </CardHeader>
        <CardContent>
          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{submitError}</div>
          )}
          <UnknownKeysNotice keys={unknownKeys(m, dynamicZodSchema)} rawEditor={`/${game}/raw/maps/${id}`} className="mb-4" />
          <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Top Actions */}
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <input type="hidden" {...register("game")} />
            <input type="hidden" {...register("id")} />
            
            <FormField 
              label="Name" 
              {...register("name")} 
              error={!!errors.name}
              helperText={errors.name?.message as string}
            />

            {/* The schema's fields as every record form shows them: global enums, object lists, suffixes. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DynamicFieldsRenderer
                fields={schemaData.fields}
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
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/maps`)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !isValid} className="shadow-lg w-full sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
          </FormProvider>

          <div className="mt-8 pt-6 border-t border-border">
            <Button 
              type="button" 
              onClick={handleDelete}
              variant="destructive" 
              disabled={submitting} 
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 shadow-lg"
            >
              Delete Map
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
