import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HeroSchema } from "~/schemas/hero";
import { getFile, createFile, uploadAsset } from "~/lib/github";
import { MultiImageUploadField, type ImageEntry } from "~/components/MultiImageUploadField";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { listDirectory } from "~/lib/github";
import { DynamicSelectField } from "~/components/DynamicSelectField";

export default function NewHero() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();

  const { data, loading, error: fetchError } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const heroSchemas = schemas.filter(s => s && s.category === "hero");
    const allFields: DynamicField[] = [];
    for (const s of heroSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, schemaCount: heroSchemas.length, game: game! };
  }, [game]);

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          </div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded-lg mt-8"></div>
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
            <p className="text-sm text-gray-500 mt-2 mb-4">You must create a schema for Heroes before adding entries.</p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>Create Schema</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Hero — {data.game}</h1>
        </CardHeader>
        <CardContent>
          <HeroForm fields={data.fields} game={data.game} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({ fields, game }: { fields: DynamicField[]; game: string }) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Images state is handled outside react-hook-form as it's complex media
  const [portraits, setPortraits] = useState<ImageEntry[]>([]);
  // We'll manage ability icons parallel to the react-hook-form array
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>({});

  const dynamicZodSchema = useMemo(() => {
    let shape: Record<string, z.ZodTypeAny> = {};
    fields.forEach(f => {
      if (["id", "name", "real_name", "roles", "portrait", "kit", "abilities"].includes(f.key)) return;
      let fieldSchema: z.ZodTypeAny = f.type === "number" ? z.coerce.number() : z.string();
      if (f.type === "list") fieldSchema = z.string(); 
      if (f.required) {
        if (f.type === "number") fieldSchema = z.coerce.number().min(1, "Required");
        else fieldSchema = z.string().min(1, "Required");
      } else {
        fieldSchema = fieldSchema.optional().or(z.literal(""));
      }
      shape[f.key] = fieldSchema;
    });
    
    // We expect kit abilities to have id, name, type. We don't dynamically validate params yet since it's freeform in the schema, 
    // but we ensure the core kit shape is valid.
    return HeroSchema.extend(shape);
  }, [fields]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<any>({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onTouched",
    defaultValues: {
      game,
      id: "",
      name: "",
      real_name: "",
      roles: [] as string[],
      portrait: "",
      kit: [] as any[],
    }
  });

  const { fields: kitFields, append, remove } = useFieldArray({
    control,
    name: "kit"
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
      const id = formData.id;
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        setSubmitError("Valid Agent Code Name is required to generate ID");
        setSubmitting(false);
        return;
      }

      // Convert roles string from fallback text field to array if needed
      if (typeof formData.roles === 'string') {
        formData.roles = formData.roles.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      // Handle Portraits
      let portraitData: string | Record<string, string> = formData.portrait || "";
      if (portraits.length === 1 && portraits[0].key === "main") {
        const ext = portraits[0].name?.split(".").pop() || "png";
        portraitData = `assets/${game}/heroes/${id}/portrait.${ext}`;
      } else if (portraits.length > 0) {
        portraitData = {};
        for (const p of portraits) {
          const ext = p.name?.split(".").pop() || "png";
          (portraitData as Record<string, string>)[p.key] = `assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
        }
      }
      if (portraitData) formData.portrait = portraitData;

      const abilityUploads: { path: string; base64: string; message: string }[] = [];
      formData.kit.forEach((ability: any, i: number) => {
        // Build ability params object from dynamically prefixed inputs
        // (Since react-hook-form manages kit[i].params natively if registered as kit.${i}.params.key, 
        // we assume it's already structured, but in HeroNew we previously had flat inputs. 
        // We ensure params is an object.)
        if (!ability.params) ability.params = {};

        const aIcons = abilityIcons[ability.id || i] || [];
        if (aIcons.length === 1 && aIcons[0].key === "main") {
          const ext = aIcons[0].name?.split(".").pop() || "png";
          const path = `assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`;
          ability.icon = path;
          if (aIcons[0].base64) abilityUploads.push({ path, base64: aIcons[0].base64, message: `Add ${ability.name} icon for ${id}` });
        } else if (aIcons.length > 0) {
          ability.icon = {};
          for (const icon of aIcons) {
            const ext = icon.name?.split(".").pop() || "png";
            const path = `assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
            ability.icon[icon.key] = path;
            if (icon.base64) abilityUploads.push({ path, base64: icon.base64, message: `Add ${ability.name} ${icon.key} icon for ${id}` });
          }
        }
      });

      const parsed = dynamicZodSchema.parse(formData) as any;

      if (!parsed.kit.length) {
        setSubmitError("At least one ability is required");
        toastError("A hero must have at least one ability in their kit.");
        setSubmitting(false);
        return;
      }

      const exists = await getFile(`data/${game}/heroes/${parsed.id}.json`);
      if (exists) {
        setSubmitError("A hero with this generated ID already exists.");
        toastError("A hero with this ID already exists.");
        setSubmitting(false);
        return;
      }

      const uploads = [];
      for (const p of portraits) {
        if (p.base64) {
          const ext = p.name?.split(".").pop() || "png";
          const path = (portraits.length === 1 && p.key === "main")
            ? `assets/${game}/heroes/${id}/portrait.${ext}`
            : `assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
          uploads.push(uploadAsset(path, p.base64, undefined, `Add portrait ${p.key} for ${id}`));
        }
      }
      for (const upload of abilityUploads) {
        uploads.push(uploadAsset(upload.path, upload.base64, undefined, upload.message));
      }
      if (uploads.length > 0) await Promise.all(uploads);

      await createFile(`data/${game}/heroes/${parsed.id}.json`, parsed, `Add hero: ${parsed.name}`);
      toastSuccess(`Hero ${parsed.name} created successfully!`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      const msg = (err as Error).message;
      setSubmitError(msg);
      toastError(`Failed to create hero: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {submitError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{submitError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField 
          label="Agent Code Name" 
          placeholder="e.g. Tracer" 
          {...register("name")} 
          error={!!errors.name}
          helperText={errors.name?.message as string}
        />
        <FormField 
          label="Real Fullname (optional)" 
          placeholder="e.g. Lena Oxton" 
          {...register("real_name")} 
          error={!!errors.real_name}
          helperText={errors.real_name?.message as string}
        />
        <FormField 
          label="Generated ID" 
          placeholder="tracer" 
          {...register("id")}
          error={!!errors.id}
          helperText={errors.id?.message as string}
          slotProps={{ input: { readOnly: false } }}
        />
      </div>

      {(() => {
        const rolesField = fields.find(f => f.key === "roles");
        return rolesField ? (
          <Controller
            name="roles"
            control={control}
            render={({ field }) => (
              <DynamicSelectField 
                label="Roles" 
                options={rolesField.options || []} 
                multiple={rolesField.type === "list"}
                required={rolesField.required}
                error={!!errors.roles}
                helperText={errors.roles?.message as string}
                {...field}
              />
            )}
          />
        ) : (
          <FormField 
            label="Roles (comma-separated fallback)" 
            placeholder="e.g. damage" 
            {...register("roles")}
            error={!!errors.roles}
            helperText={errors.roles?.message as string}
          />
        );
      })()}

      <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
        <MultiImageUploadField label="Portraits" entries={portraits} onChange={setPortraits} defaultKey="main" />
        {portraits.length === 0 && (
          <div className="mt-4">
            <FormField 
              label="Or Image URL" 
              placeholder="https://..." 
              {...register("portrait")}
              error={!!errors.portrait}
              helperText={errors.portrait?.message as string}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {fields.map((f: DynamicField) => {
          if (["id", "name", "real_name", "roles", "portrait", "kit", "abilities"].includes(f.key)) return null;
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
      </div>

      <div className="pt-6">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 tracking-wider uppercase">Kit Abilities</h3>
        
        {errors.kit?.message && (
          <p className="text-sm text-red-500 mb-2">{errors.kit.message as string}</p>
        )}

        <div className="space-y-4">
          {kitFields.map((field, i) => {
            const abilityErrors = (errors.kit as any)?.[i];
            return (
              <div key={field.id} className="p-4 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ability {i + 1}</span>
                  <button type="button" onClick={() => remove(i)}
                    className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">Remove</button>
                </div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-64">
                    <MultiImageUploadField 
                      label="Icons" 
                      entries={abilityIcons[field.id] || []}
                      onChange={(newIcons) => setAbilityIcons({ ...abilityIcons, [field.id]: newIcons })}
                      defaultKey="main"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormField 
                        label="ID (kebab-case)" 
                        {...register(`kit.${i}.id` as const)}
                        error={!!abilityErrors?.id}
                        helperText={abilityErrors?.id?.message as string}
                      />
                      <FormField 
                        label="Name" 
                        {...register(`kit.${i}.name` as const)}
                        error={!!abilityErrors?.name}
                        helperText={abilityErrors?.name?.message as string}
                      />
                      <FormField 
                        label="Type" 
                        {...register(`kit.${i}.type` as const)}
                        error={!!abilityErrors?.type}
                        helperText={abilityErrors?.type?.message as string}
                      />
                    </div>
                    <FormField 
                      label="Description (optional)" 
                      {...register(`kit.${i}.description` as const)}
                      error={!!abilityErrors?.description}
                      helperText={abilityErrors?.description?.message as string}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => append({ id: "", name: "", type: "", description: "", params: {} })}
          className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1">
          + Add Ability
        </button>
      </div>

      <div className="pt-6">
        <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/heroes`)} className="mr-3">Cancel</Button>
        <Button type="submit" disabled={submitting || !isValid} className="shadow-lg shadow-orange-500/20 w-40">
          {submitting ? "Creating..." : "Create Hero"}
        </Button>
      </div>
    </form>
  );
}
