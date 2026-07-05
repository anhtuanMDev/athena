import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapSchema, type Map } from "~/schemas/map";
import { getFile, updateFile, deleteFile, isConflictError, listDirectory } from "~/lib/github";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { DynamicSelectField } from "~/components/DynamicSelectField";

export default function EditMap() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const { data: fileData, loading: fileLoading, error: fileFetchError } = useData<{ content: Map; sha: string } | null>(
    () => getFile<Map>(`data/${game}/maps/${id}.json`),
    [game, id]
  );

  const { data: schemaData, loading: schemaLoading, error: schemaFetchError } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const mapSchemas = schemas.filter(s => s && s.category === "map");
    const allFields: DynamicField[] = [];
    for (const s of mapSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, schemaCount: mapSchemas.length, game: game! };
  }, [game]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dynamicZodSchema = useMemo(() => {
    if (!schemaData) return MapSchema;
    const shape: Record<string, z.ZodTypeAny> = {};
    schemaData.fields.forEach(f => {
      if (f.key === "name" || f.key === "id" || f.key === "game_modes") return;
      let fieldSchema: z.ZodTypeAny = f.type === "number" ? z.coerce.number() : z.string();
      if (f.type === "list") fieldSchema = z.string(); // Lists are handled as comma-separated strings
      if (f.required) {
        if (f.type === "number") fieldSchema = z.coerce.number().min(1, "Required");
        else fieldSchema = z.string().min(1, "Required");
      } else {
        fieldSchema = fieldSchema.optional().or(z.literal(""));
      }
      shape[f.key] = fieldSchema;
    });
    return MapSchema.extend(shape).passthrough();
  }, [schemaData]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isValid }
  } = useForm({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onTouched",
  });

  useEffect(() => {
    if (fileData?.content) {
      const defaultValues = { ...fileData.content };
      if (defaultValues.game_modes && Array.isArray(defaultValues.game_modes)) {
        defaultValues.game_modes = defaultValues.game_modes.join(", ") as any;
      }
      reset(defaultValues);
    }
  }, [fileData, reset]);

  const onSubmit = async (formData: any) => {
    if (!fileData) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const parsed = dynamicZodSchema.parse({
        ...formData,
        game_modes: (formData.game_modes as string || "").split(",").map((s: string) => s.trim()).filter(Boolean),
      });

      try {
        await updateFile(`data/${game}/maps/${id}.json`, parsed, fileData.sha, `Update map: ${parsed.name}`);
        toastSuccess(`Map ${parsed.name} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setSubmitError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
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
          setSubmitError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
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
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (fileFetchError || schemaFetchError) return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Error</h3>
      <p>{String(fileFetchError || schemaFetchError)}</p>
    </div>
  );

  if (!fileData || !schemaData) return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg">Map not found or Schema missing</h3>
    </div>
  );

  const m = fileData.content;

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">Edit Map: {m.name}</h1>
        </CardHeader>
        <CardContent>
          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{submitError}</div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <input type="hidden" {...register("game")} />
            <input type="hidden" {...register("id")} />
            
            <FormField 
              label="Name" 
              {...register("name")} 
              error={!!errors.name}
              helperText={errors.name?.message as string}
            />

            {schemaData.fields.map((f) => {
              if (f.key === "name" || f.key === "id") return null;
              
              if (f.type === "enum" || f.type === "list") {
                return (
                  <Controller
                    key={f.key}
                    name={f.key}
                    control={control}
                    render={({ field }) => (
                      <DynamicSelectField 
                        label={f.label}
                        options={f.options || []}
                        multiple={f.type === "list"}
                        required={f.required}
                        error={!!errors[f.key]}
                        helperText={errors[f.key]?.message as string}
                        currentValue={field.value}
                        {...field}
                      />
                    )}
                  />
                );
              }
              return (
                <FormField 
                  key={f.key}
                  label={f.label} 
                  required={f.required} 
                  type={f.type === "number" ? "number" : "text"} 
                  {...register(f.key)}
                  error={!!errors[f.key]}
                  helperText={errors[f.key]?.message as string}
                />
              );
            })}
            
            <div className="pt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/maps`)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !isValid} className="shadow-lg shadow-orange-500/20 w-full sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
            <Button 
              type="button" 
              onClick={handleDelete}
              variant="destructive" 
              disabled={submitting} 
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
            >
              Delete Map
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
