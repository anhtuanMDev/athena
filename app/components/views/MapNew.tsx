import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapSchema } from "~/schemas/map";
import { getFile, createFile, listDirectory } from "~/lib/github";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { useData } from "~/lib/use-data";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";
import { DynamicSelectField } from "~/components/DynamicSelectField";

export default function NewMap() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  
  const { data, loading, error: fetchError } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const mapSchemas = schemas.filter(s => s && s.category === "map");
    const allFields: DynamicField[] = [];
    for (const s of mapSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, schemaCount: mapSchemas.length, game: game! };
  }, [game]);

  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dynamicZodSchema = useMemo(() => {
    if (!data) return MapSchema;
    const shape: Record<string, z.ZodTypeAny> = {};
    data.fields.forEach(f => {
      if (f.key === "name" || f.key === "id" || f.key === "game_modes") return;
      let fieldSchema: z.ZodTypeAny = f.type === "number" ? z.coerce.number() : z.string();
      if (f.type === "list") fieldSchema = z.string(); // Lists are handled as comma-separated strings natively in the form
      if (f.required) {
        if (f.type === "number") fieldSchema = z.coerce.number().min(1, "Required");
        else fieldSchema = z.string().min(1, "Required");
      } else {
        fieldSchema = fieldSchema.optional().or(z.literal(""));
      }
      shape[f.key] = fieldSchema;
    });
    return MapSchema.extend(shape).strict();
  }, [data]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onTouched",
    defaultValues: {
      game: game!,
      id: "",
      name: "",
      game_modes: "",
    }
  });

  const nameValue = watch("name");

  // Auto-generate ID from Name
  useEffect(() => {
    if (nameValue && typeof nameValue === 'string') {
      const generatedId = nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      setValue("id", generatedId, { shouldValidate: true, shouldDirty: true });
    }
  }, [nameValue, setValue]);

  const onSubmit = async (formData: any) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const parsed = dynamicZodSchema.parse({
        ...formData,
        game_modes: (formData.game_modes as string || "").split(",").map((s: string) => s.trim()).filter(Boolean),
      });

      const exists = await getFile(`data/${game}/maps/${parsed.id}.json`);
      if (exists) {
        setSubmitError("A map with this ID already exists.");
        toastError("A map with this ID already exists.");
        setSubmitting(false);
        return;
      }
      await createFile(`data/${game}/maps/${parsed.id}.json`, parsed, `Add map: ${parsed.name}`);
      toastSuccess(`Map ${parsed.name} created successfully!`);
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

  if (fetchError) return (
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No Schema Configured</h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">You must create a schema for Maps before adding entries.</p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>Create Schema</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Map — {game}</h1></CardHeader>
        <CardContent>
          {submitError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{submitError}</div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                  htmlInput: { readOnly: false }
                }}
              />
            </div>
            
            {data.fields.map((f) => {
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
                        error={!!(errors as Record<string, any>)[f.key]}
                        helperText={(errors as Record<string, any>)[f.key]?.message as string}
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
                  error={!!(errors as Record<string, any>)[f.key]}
                  helperText={(errors as Record<string, any>)[f.key]?.message as string}
                />
              );
            })}
            
            <div className="pt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/maps`)}>Cancel</Button>
              <Button type="submit" disabled={submitting || !isValid} className="shadow-lg shadow-orange-500/20">
                {submitting ? "Creating..." : "Create Map"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
