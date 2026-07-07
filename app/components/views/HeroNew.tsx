import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Download, Upload, ClipboardPaste } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { EntityReferenceField } from "~/components/EntityReferenceField";
import { FormField } from "~/components/FormField";
import {
  MultiImageUploadField,
  type ImageEntry,
} from "~/components/MultiImageUploadField";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { AbilitiesField } from "~/components/views/AbilitiesField";
import { ObjectArrayField } from "~/components/views/ObjectArrayField";
import {
  createFile,
  getFile,
  getFileSha,
  listDirectory,
  uploadAsset,
} from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import {type DynamicField,
  type DynamicSchemaFile, buildDynamicZodSchema} from "~/schemas/dynamic-schema";
import { HeroSchema } from "~/schemas/hero";

function AutoGenerateId({ control, setValue, touchedFields }: any) {
  const nameValue = useWatch({ control, name: "name" });
  const idValue = useWatch({ control, name: "id" });

  useEffect(() => {
    if (nameValue && typeof nameValue === "string" && !touchedFields.id) {
      const generatedId = nameValue
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (idValue !== generatedId) {
        setValue("id", generatedId, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    }
  }, [nameValue, touchedFields.id, setValue, idValue]);

  return null;
}

export default function NewHero() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();

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
    const heroSchemas = schemas.filter((s) => s && s.category === "hero");
    return {
      schemas: heroSchemas,
      schemaCount: heroSchemas.length,
      game: game!,
    };
  }, [game], "HeroNew-66");

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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No Schema Configured
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              You must create a schema for Heroes before adding entries.
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
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            New Hero - {data.game}
          </h1>
          <Button
            variant="outline"
            size="small"
            onClick={() => navigate(`/${data.game}/schemas`)}
            className="w-full md:w-auto"
          >
            Edit Schema
          </Button>
        </CardHeader>
        <CardContent>
          <HeroForm schemas={data.schemas} game={data.game} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({
  schemas,
  game,
}: {
  schemas: DynamicSchemaFile[];
  game: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  // Images state is handled outside react-hook-form as it's complex media
  const [portraits, setPortraits] = useState<ImageEntry[]>([]);
  // We'll manage ability icons parallel to the react-hook-form array
  const [abilityIcons, setAbilityIcons] = useState<
    Record<string, ImageEntry[]>
  >({});

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    schemas[0]?.id || "",
  );
  const activeSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) || schemas[0],
    [schemas, selectedSchemaId],
  );
  const fields = activeSchema?.fields || [];

  const dynamicZodSchema = useMemo(() => buildDynamicZodSchema(fields, HeroSchema, ["id", "name", "real_name", "portrait"]), [fields]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid, touchedFields },
  } = useForm<any>({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onChange",
    defaultValues: {
      game,
      id: "",
      schema_id: schemas[0]?.id || "",
      name: "",
      real_name: "",
      portrait: "",
      kit: [] as any[],
    },
  });

  const idValue = useWatch({ control, name: "id" });

  const aiPromptMarkdown = `# Athena Hero Data Generation Guidelines
You are tasked with generating JSON data for a new hero in the Athena platform.
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
      // Handle Portraits
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

      const abilityUploads: {
        path: string;
        base64: string;
        message: string;
      }[] = [];
      
      // Validate mode_overrides
      const modes = await listDirectory(game, "modes");
      const modeSet = new Set(modes);
      for (const f of fields.filter((f) => f.type === "abilities")) {
        const abilityList = formData[f.key] || [];
        for (const ability of abilityList) {
          if (ability.mode_overrides) {
            for (const modeId of Object.keys(ability.mode_overrides)) {
              if (!modeSet.has(modeId as string)) {
                throw new Error(`Ability '${ability.name || ability.id}' references invalid mode override: '${modeId}'`);
              }
            }
          }
        }
      }

      // Ensure Abilities are formatted correctly (icons processing)
      fields
        .filter((f) => f.type === "abilities")
        .forEach((f) => {
          const abilityList = formData[f.key] || [];
          abilityList.forEach((ability: any, i: number) => {
            if (!ability.params) ability.params = {};

            const aIcons = abilityIcons[ability._clientId || ability.id || i] || [];
            if (aIcons.length === 1 && aIcons[0].key === "main") {
              const ext = aIcons[0].name?.split(".").pop() || "png";
              const displayPath = `/api/assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`;
              const uploadPath = `public/assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`;
              ability.icon = displayPath;
              if (aIcons[0].base64)
                abilityUploads.push({
                  path: uploadPath,
                  base64: aIcons[0].base64,
                  message: `Add ${ability.name} icon for ${id}`,
                });
            } else if (aIcons.length > 0) {
              ability.icon = {};
              for (const icon of aIcons) {
                const ext = icon.name?.split(".").pop() || "png";
                const displayPath = `/api/assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
                const uploadPath = `public/assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
                ability.icon[icon.key] = displayPath;
                if (icon.base64)
                  abilityUploads.push({
                    path: uploadPath,
                    base64: icon.base64,
                    message: `Add ${ability.name} ${icon.key} icon for ${id}`,
                  });
              }
            }
          });
        });

      const parsed = dynamicZodSchema.parse(formData) as any;

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
              `Add portrait ${p.key} for ${id}`,
            ),
          );
        }
      }
      for (const upload of abilityUploads) {
        const sha = await getFileSha(upload.path);
        uploads.push(
          uploadAsset(
            upload.path,
            upload.base64,
            sha || undefined,
            upload.message,
          ),
        );
      }
      if (uploads.length > 0) await Promise.all(uploads);

      await createFile(
        `data/${game}/heroes/${parsed.id}.json`,
        parsed,
        `Add hero: ${parsed.name}`,
      );
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
      <AutoGenerateId
        control={control}
        setValue={setValue}
        touchedFields={touchedFields}
      />
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

      {schemas.length > 1 && (
        <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800 rounded-xl">
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
          slotProps={{ inputLabel: { shrink: idValue ? true : undefined } }}
        />
      </div>

      <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
        <MultiImageUploadField
          label="Portraits"
          entries={portraits}
          onChange={setPortraits}
          defaultKey="main"
        />
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

      <div className="pt-6">
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(`/${game}/heroes`)}
          className="mr-3"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="shadow-lg shadow-orange-500/20 w-40"
        >
          {submitting ? "Creating..." : "Create Hero"}
        </Button>
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
