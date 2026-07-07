import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Download, Upload, ClipboardPaste } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";
import { DiffView } from "~/components/DiffView";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { EntityReferenceField } from "~/components/EntityReferenceField";
import { FormField } from "~/components/FormField";
import { type ImageEntry } from "~/components/MultiImageUploadField";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { AbilitiesField } from "~/components/views/AbilitiesField";
import { ObjectArrayField } from "~/components/views/ObjectArrayField";
import type { DiffEntry } from "~/lib/diff";
import { computeDiff } from "~/lib/diff";
import {
  getFile,
  getFileSha,
  isConflictError,
  listDirectory,
  updateFile,
  uploadAsset,
} from "~/lib/github";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import {
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";
import { HeroSchema, type Hero } from "~/schemas/hero";

export default function EditHero() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);
  const navigate = useNavigate();
  const heroResult = useData<{ content: Hero; sha: string } | null>(
    () => getFile<Hero>(`data/${game}/heroes/${id}.json`),
    [game, id],
  );
  const schemaResult = useData<{
    schemas: DynamicSchemaFile[];
  } | null>(async () => {
    try {
      const schemas = await listDirectory<DynamicSchemaFile>(
        game!,
        "schemas",
        true,
      );
      const heroSchemas = schemas.filter((s) => s && s.category === "hero");
      return { schemas: heroSchemas };
    } catch (e) {
      return { schemas: [] };
    }
  }, [game]);

  if (heroResult.loading || schemaResult.loading) {
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
  if (heroResult.error) {
    return (
      <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Failed to load hero</h3>
        <p>{String(heroResult.error)}</p>
      </div>
    );
  }
  if (!heroResult.data) {
    return <div className="text-red-500 p-4">Hero not found</div>;
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            Edit Hero - {heroResult.data.content.name}
          </h1>
          <Button
            variant="outline"
            size="small"
            onClick={() => navigate(`/${game}/schemas`)}
            className="w-full md:w-auto"
          >
            Edit Schema
          </Button>
        </CardHeader>
        <CardContent>
          <EditHeroForm
            key={heroResult.data.sha}
            hero={heroResult.data.content}
            sha={heroResult.data.sha}
            schemas={schemaResult.data?.schemas ?? []}
            game={game!}
            id={id!}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EditHeroForm({
  hero,
  sha,
  schemas,
  game,
  id,
}: {
  hero: Hero;
  sha: string;
  schemas: DynamicSchemaFile[];
  game: string;
  id: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [preview, setPreview] = useState<{
    diffs: DiffEntry[];
    heroJson: string;
    sha: string;
    abilityUploads?: { path: string; base64: string; message: string }[];
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittingCommit, setSubmittingCommit] = useState(false);

  // We manage complex media independently of hook-form
  const [portraits, setPortraits] = useState<ImageEntry[]>([]);
  const [abilityIcons, setAbilityIcons] = useState<
    Record<string, ImageEntry[]>
  >({});

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    hero.schema_id || schemas[0]?.id || "",
  );
  const activeSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) || schemas[0],
    [schemas, selectedSchemaId],
  );
  const fields = activeSchema?.fields || [];

  const dynamicZodSchema = useMemo(() => {
    let shape: Record<string, z.ZodTypeAny> = {};
    fields.forEach((f) => {
      if (["id", "name", "real_name", "portrait"].includes(f.key)) return;
      let fieldSchema: z.ZodTypeAny =
        f.type === "number"
          ? z.coerce.number()
          : f.type === "boolean"
            ? z.boolean()
            : z.string();
      if (f.type === "list" || f.type === "reference_list")
        fieldSchema = z.array(z.string());
      if (f.type === "abilities") fieldSchema = z.array(z.any());
      if (f.type === "object_array") fieldSchema = z.array(z.any());
      if (f.required) {
        if (f.type === "number")
          fieldSchema = z.coerce.number().min(1, "Required");
        else if (f.type === "boolean")
          fieldSchema = z.boolean().refine((val) => val === true, "Required");
        else if (
          f.type === "list" ||
          f.type === "reference_list" ||
          f.type === "abilities" ||
          f.type === "object_array"
        )
          fieldSchema = z.array(z.any()).min(1, "Required");
        else fieldSchema = z.string().min(1, "Required");
      } else {
        if (f.type === "boolean") fieldSchema = z.boolean().nullish().catch(undefined);
        else if (
          f.type === "list" ||
          f.type === "reference_list" ||
          f.type === "abilities" ||
          f.type === "object_array"
        )
          fieldSchema = z.array(z.any()).nullish().catch(undefined);
        else fieldSchema = fieldSchema.nullish().or(z.literal("")).catch(undefined);
      }
      shape[f.key] = fieldSchema;
    });
    return HeroSchema.extend(shape);
  }, [fields]);

  const defaultValues = useMemo(() => {
    const vals = { ...hero };
    return vals;
  }, [hero, fields]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid, isDirty },
  } = useForm<any>({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onChange",
    defaultValues: defaultValues as any,
  });

  const aiPromptMarkdown = `# Athena Hero Data Generation Guidelines
You are tasked with generating JSON data for a hero in the Athena platform.
This JSON data must strictly follow the schema provided below.

## Schema Definition
\`\`\`json
${JSON.stringify(
  fields.map((f) => ({
    key: f.key,
    type: f.type,
    required: f.required,
    options: f.options,
    subFields: f.subFields,
  })),
  null,
  2,
)}
\`\`\`

## Expected Output JSON
You must return ONLY a JSON object with the keys defined above.
Do not include any extra root properties or markdown formatting around the json (no \`\`\`json block).

Example Output:
{
  "name": "Hero Name",
  "real_name": "Real Name",
  "health": 200
}
`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPromptMarkdown);
    toastSuccess("Copied to clipboard!");
  };

  const handleDownloadPrompt = () => {
    const blob = new Blob([aiPromptMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "athena_hero_data_prompt.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPastedJson = () => {
    try {
      const json = JSON.parse(pastedJson);
      if (typeof json === "object" && json !== null) {
        Object.keys(json).forEach((key) => {
          setValue(key, json[key], { shouldDirty: true, shouldValidate: true });
        });
        toastSuccess("Imported hero data from pasted text!");
        setShowImportModal(false);
        setPastedJson("");
      } else {
        toastError("JSON must be an object");
      }
    } catch (e) {
      toastError("Invalid JSON format");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (typeof json === "object" && json !== null) {
          Object.keys(json).forEach((key) => {
            setValue(key, json[key], {
              shouldDirty: true,
              shouldValidate: true,
            });
          });
          toastSuccess("Imported hero data from file!");
          setShowImportModal(false);
        } else {
          toastError("JSON must be an object");
        }
      } catch (err) {
        toastError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const onSubmitPreview = async (formData: any) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Handle Portraits overrides
      let portraitData: string | Record<string, string> =
        formData.portrait || "";
      if (portraits.length === 1 && portraits[0].key === "main") {
        const ext = portraits[0].name?.split(".").pop() || "png";
        portraitData = `/api/assets/${game}/heroes/${id}/portrait.${ext}`;
      } else if (portraits.length > 0) {
        portraitData = {};
        for (const p of portraits) {
          const ext = p.name?.split(".").pop() || "png";
          (portraitData as Record<string, string>)[p.key] =
            `/api/assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
        }
      }
      if (portraitData) formData.portrait = portraitData;

      const abilityUploads: { path: string; base64: string; message: string }[] = [];
      // Ensure Abilities are formatted correctly
      fields
        .filter((f) => f.type === "abilities")
        .forEach((f) => {
          const abilityList = formData[f.key] || [];
          abilityList.forEach((ability: any, i: number) => {
            if (!ability.params) ability.params = {};
            const aIcons = abilityIcons[ability.id || i] || [];
            if (aIcons.length === 1 && aIcons[0].key === "main") {
              const ext = aIcons[0].name?.split(".").pop() || "png";
              ability.icon = `/api/assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`;
              if (aIcons[0].base64) {
                abilityUploads.push({
                  path: `public/assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`,
                  base64: aIcons[0].base64,
                  message: `Update ${ability.name} icon for ${id}`,
                });
              }
            } else if (aIcons.length > 0) {
              ability.icon = {};
              for (const icon of aIcons) {
                const ext = icon.name?.split(".").pop() || "png";
                ability.icon[icon.key] =
                  `/api/assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
                if (icon.base64) {
                  abilityUploads.push({
                    path: `public/assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`,
                    base64: icon.base64,
                    message: `Update ${ability.name} ${icon.key} icon for ${id}`,
                  });
                }
              }
            }
          });
        });

      const parsed = dynamicZodSchema.parse(formData) as any;
      const diffs = computeDiff(hero, parsed);
      setPreview({ diffs, heroJson: JSON.stringify(parsed), sha: sha, abilityUploads });
    } catch (err) {
      const msg = (err as Error).message;
      setSubmitError(msg);
      toastError(`Validation Failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!preview) return;
    setSubmittingCommit(true);
    setSubmitError(null);
    try {
      const parsed = HeroSchema.safeParse(JSON.parse(preview.heroJson));
      if (!parsed.success) {
        setSubmitError("Hero data failed validation on commit");
        toastError("Validation failed on commit");
        return;
      }

      const uploads = [];
      for (const p of portraits) {
        if (p.base64) {
          const ext = p.name?.split(".").pop() || "png";
          const path =
            portraits.length === 1 && p.key === "main"
              ? `public/assets/${game}/heroes/${id}/portrait.${ext}`
              : `public/assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
          const sha = await getFileSha(path);
          uploads.push(
            uploadAsset(
              path,
              p.base64,
              sha || undefined,
              `Update portrait ${p.key} for ${id}`
            )
          );
        }
      }
      if (preview.abilityUploads) {
        for (const upload of preview.abilityUploads) {
          const sha = await getFileSha(upload.path);
          uploads.push(
            uploadAsset(
              upload.path,
              upload.base64,
              sha || undefined,
              upload.message
            )
          );
        }
      }
      if (uploads.length > 0) await Promise.all(uploads);

      await updateFile(
        `data/${game}/heroes/${id}.json`,
        parsed.data,
        sha,
        `Update hero: ${parsed.data.name}`,
      );
      toastSuccess(`Hero ${parsed.data.name} updated successfully!`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      if (isConflictError(err)) {
        setSubmitError(
          "Conflict detected. The file has been modified. Please try again.",
        );
        toastError("Conflict detected! Someone else modified this file.");
      } else {
        const msg = err instanceof Error ? err.message : "Error";
        setSubmitError(msg);
        toastError(`Failed to save: ${msg}`);
      }
    } finally {
      setSubmittingCommit(false);
    }
  };

  if (preview) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Review Changes
        </h2>
        <DiffView diffs={preview.diffs} />
        {submitError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">
            {submitError}
          </div>
        )}
        <form
          onSubmit={handleCommit}
          className="flex gap-4 pt-4 border-t border-gray-200/50 dark:border-gray-800/50"
        >
          <input type="hidden" name="_heroJson" value={preview.heroJson} />
          <Button
            type="submit"
            disabled={submittingCommit}
            className="shadow-lg shadow-orange-500/20 w-40"
          >
            {submittingCommit ? "Committing..." : "Confirm Commit"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPreview(null);
              setSubmitError(null);
            }}
            className="w-32 bg-gray-100 dark:bg-gray-800"
          >
            Cancel
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmitPreview)} className="space-y-4">
      {submitError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">
          {submitError}
        </div>
      )}

      {/* AI & File Actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl mb-6">
        <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 text-sm font-medium">
          <Sparkles className="w-5 h-5 text-blue-500" />
          AI Data Generation
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={() => setShowPromptModal(true)}
            className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Get AI Prompt
          </Button>
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={() => setShowImportModal(true)}
            className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
          >
            <Download className="w-4 h-4 mr-2" />
            Import AI Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {schemas.length > 1 && (
          <div className="col-span-1 md:col-span-2 mb-4 p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800 rounded-xl">
            <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">
              Hero Schema Profile
            </label>
            <select
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
              value={selectedSchemaId}
              onChange={(e) => {
                setSelectedSchemaId(e.target.value);
                setValue("schema_id", e.target.value, { shouldDirty: true });
              }}
            >
              {schemas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Changing the schema will update the available fields below.
            </p>
          </div>
        )}
        <FormField
          label="Name"
          {...register("name")}
          error={!!errors.name}
          helperText={errors.name?.message as string}
        />
        <FormField
          label="Portrait URL"
          {...register("portrait")}
          error={!!errors.portrait}
          helperText={errors.portrait?.message as string}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {fields.map((f: DynamicField) => {
          if (["id", "name", "real_name", "portrait"].includes(f.key))
            return null;
          if (f.type === "abilities") {
            return (
              <div className="col-span-1 md:col-span-2" key={f.key}>
                <AbilitiesField
                  name={f.key}
                  label={f.label}
                  control={control}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  abilityIcons={abilityIcons}
                  setAbilityIcons={setAbilityIcons}
                  subFields={f.subFields || []}
                  options={f.options}
                />
              </div>
            );
          }
          if (f.type === "object_array") {
            return (
              <div className="col-span-1 md:col-span-2" key={f.key}>
                <ObjectArrayField
                  name={f.key}
                  label={f.label}
                  control={control}
                  register={register}
                  errors={errors}
                  subFields={f.subFields || []}
                />
              </div>
            );
          }
          if (f.type === "reference" || f.type === "reference_list") {
            return (
              <div className="col-span-1 md:col-span-2" key={f.key}>
                <Controller
                  name={f.key}
                  control={control}
                  render={({ field }) => (
                    <EntityReferenceField
                      label={f.label}
                      game={game}
                      referenceApiEndpoint={f.referenceApiEndpoint}
                      referenceValueKey={f.referenceValueKey}
                      referenceLabelKey={f.referenceLabelKey}
                      multiple={f.type === "reference_list"}
                      required={f.required}
                      error={!!errors[f.key]}
                      helperText={errors[f.key]?.message as string}
                      currentValue={field.value}
                      {...field}
                    />
                  )}
                />
              </div>
            );
          }
          if (f.type === "enum" || f.type === "list") {
            return (
              <div className="col-span-1 md:col-span-2" key={f.key}>
                <Controller
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
              </div>
            );
          }
          if (f.type === "boolean") {
            return (
              <div
                key={f.key}
                className="flex items-center gap-3 h-[40px] px-3 mt-1 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-transparent"
              >
                <input
                  type="checkbox"
                  id={`field-${f.key}`}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-800 cursor-pointer"
                  {...register(f.key)}
                />
                <label
                  htmlFor={`field-${f.key}`}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                >
                  {f.label}
                </label>
                {errors[f.key] && (
                  <span className="text-xs text-red-500 ml-auto">
                    {(errors[f.key] as any)?.message}
                  </span>
                )}
              </div>
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

      <div className="pt-6 border-t border-gray-200/50 dark:border-gray-800/50 mt-8">
        {Object.keys(errors).length > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
            <h4 className="text-sm font-bold text-red-800 dark:text-red-400 mb-2">
              Please fix the following validation errors:
            </h4>
            <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
              {Object.entries(errors).map(([key, err]) => (
                <li key={key}>
                  <span className="font-semibold">{key}:</span>{" "}
                  {(err as any)?.message || "Invalid value"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/${game}/heroes`)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !isDirty}
            className="shadow-lg shadow-orange-500/20"
          >
            {submitting ? "Processing..." : "Preview Changes"}
          </Button>
        </div>
      </div>
      {/* Prompt Modal */}
      {showPromptModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt
                  Instructions
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-gray-500 mb-4">
                  Use the following prompt to instruct an AI (like ChatGPT or
                  Claude) to generate data for you. You can copy the text or
                  download it as a file.
                </p>
                <textarea
                  readOnly
                  value={aiPromptMarkdown}
                  className="w-full h-64 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-xs font-mono text-gray-700 dark:text-gray-300 focus:outline-none resize-none"
                />
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPromptModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPrompt}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download .md
                </Button>
                <Button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <ClipboardPaste className="w-4 h-4" /> Copy to Clipboard
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Import Modal */}
      {showImportModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" /> Import AI Data
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Option 1: Upload JSON File
                  </label>
                  <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        handleFileUpload(e);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Click or drag and drop your generated JSON file here
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    OR
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Option 2: Paste JSON Directly
                  </label>
                  <textarea
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder="Paste your JSON data here..."
                    rows={6}
                    className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    handleImportPastedJson();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!pastedJson.trim()}
                >
                  Import Pasted Data
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
}
