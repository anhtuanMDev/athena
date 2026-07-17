import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Download, Upload, ClipboardPaste, Copy } from "lucide-react";
import {
  Controller,
  useForm,
  useWatch,
  FormProvider,
  useFormContext,
} from "react-hook-form";
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
import { AIPromptModalWrapper, ImportDataModalWrapper } from "~/components/views/HeroFormModals";
import {
  createFile,
  getFile,
  getFileSha,
  listDirectory,
  uploadAsset,
} from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import {
  type DynamicField,
  type DynamicSchemaFile,
  buildDynamicZodSchema,
} from "~/schemas/dynamic-schema";
import { HeroSchema } from "~/schemas/hero";
import { type GlobalEnum } from "~/schemas/enum";

function AutoGenerateId() {
  const {
    control,
    setValue,
    formState: { touchedFields },
  } = useFormContext<any>();
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
  } = useData(
    async () => {
      const schemas = await listDirectory<DynamicSchemaFile>(
        game!,
        "schemas",
        true,
      );
      const enums = await listDirectory<GlobalEnum>(game!, "enums", true);
      const heroSchemas = schemas.filter((s) => s && s.category === "hero");
      return {
        schemas: heroSchemas,
        schemaCount: heroSchemas.length,
        enums,
        game: game!,
      };
    },
    [game],
    `${game}-hero-schemas`,
  );

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
          <HeroForm
            schemas={data.schemas}
            enums={data.enums}
            game={data.game}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({
  schemas,
  enums,
  game,
}: {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  game: string;
}) {
  const [formKey, setFormKey] = useState(0);
  const [initData, setInitData] = useState<Record<string, any>>({
    game,
    id: "",
    schema_id: schemas[0]?.id || "",
    name: "",
    real_name: "",
    portrait: "",
    kit: [],
  });

  const handleImportSuccess = (data: Record<string, any>) => {
    setInitData(data);
    setFormKey((k) => k + 1);
  };

  return (
    <HeroFormInner
      key={formKey}
      schemas={schemas}
      enums={enums}
      game={game}
      initData={initData}
      onImportSuccess={handleImportSuccess}
    />
  );
}

type HeroFormInnerProps = {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  game: string;
  initData: Record<string, any>;
  onImportSuccess: (data: Record<string, any>) => void;
};

function HeroFormInner({
  schemas,
  enums,
  game,
  initData,
  onImportSuccess,
}: HeroFormInnerProps) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Images state is handled outside react-hook-form as it's complex media
  const [portraits, setPortraits] = useState<ImageEntry[]>([]);
  // We'll manage ability icons parallel to the react-hook-form array
  const [abilityIcons, setAbilityIcons] = useState<
    Record<string, ImageEntry[]>
  >({});

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    initData.schema_id || schemas[0]?.id || "",
  );
  const activeSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) || schemas[0],
    [schemas, selectedSchemaId],
  );
  const fields = activeSchema?.fields || [];

  console.log("fields", fields);

  const dynamicZodSchema = useMemo(
    () =>
      buildDynamicZodSchema(fields, HeroSchema, [
        "id",
        "name",
        "real_name",
        "portrait",
      ]),
    [fields],
  );

  const methods = useForm<any>({
    resolver: zodResolver(dynamicZodSchema),
    mode: "onChange",
    defaultValues: initData,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isValid, touchedFields },
  } = methods;

  const idValue = useWatch({ control, name: "id" });

  const aiPromptMarkdown = useMemo(() => {
    return `I have provided a source (like a wiki page) about a hero. Extract the hero's data and output a **single JSON object** matching the schema below.

> **Note:** Do NOT include \`id\` or \`game\` — these are injected automatically by the system.

### Field Schema
\`\`\`json
${JSON.stringify(
  [
    { key: "name", type: "string", required: true },
    { key: "real_name", type: "string", required: false },
    ...fields.map((f) => {
      let options = f.options;
      if (f.globalEnumId) {
        const globalEnum = enums.find((e) => e.id === f.globalEnumId);
        if (globalEnum) {
          options = globalEnum.options.map((o) => o.id);
        }
      }

      let subFields = f.subFields;
      if (subFields) {
        subFields = subFields.map((sf) => {
          let sfOptions = sf.options;
          if (sf.globalEnumId) {
            const sfGlobalEnum = enums.find((e) => e.id === sf.globalEnumId);
            if (sfGlobalEnum) {
              sfOptions = sfGlobalEnum.options.map((o) => o.id);
            }
          }
          return { ...sf, options: sfOptions };
        });
      }

      return {
        key: f.key,
        type: f.type,
        required: f.required,
        options: options,
        subFields: subFields,
      };
    }),
  ],
  null,
  2,
)}
\`\`\`

### Rules for \`abilities\` / \`weapon\` arrays
Each item in these arrays **must** follow this exact shape. \`name\` and \`type\` are **required non-empty strings**:
\`\`\`json
{
  "name": "Ability Name",
  "type": "ability_type",
  "description": "Optional description",
  "params": {}
}
\`\`\`

Use \`""\`, \`0\`, \`false\`, or \`[]\` for optional fields not found in the source. Return ONLY the JSON object with no extra commentary.`;
  }, [fields, enums]);



  const formatImportedJson = (
    json: Record<string, unknown>,
  ): Record<string, unknown> => {
    const formattedJson: Record<string, unknown> = { ...json };

    // Inject system fields the AI does not produce
    if (!formattedJson.game) formattedJson.game = game;
    if (!formattedJson.id) {
      const heroName = formattedJson.name;
      if (heroName && typeof heroName === "string") {
        formattedJson.id = heroName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      }
    }

    const sanitizeValue = (val: any, fieldDef: DynamicField) => {
      if (fieldDef.type === "list" || fieldDef.type === "reference_list") {
        if (val === "" || val === null || val === undefined || val === false || val === 0) {
          return [];
        }
        if (!Array.isArray(val)) {
          return [String(val)];
        }
        return val.map(String);
      }
      if (fieldDef.type === "abilities" || fieldDef.type === "weapon" || fieldDef.type === "object_array") {
        if (val === "" || val === null || val === undefined || val === false || val === 0) {
          return [];
        }
        if (!Array.isArray(val)) {
          return [val];
        }
      }
      return val;
    };

    fields.forEach((f) => {
      if (formattedJson[f.key] !== undefined) {
        formattedJson[f.key] = sanitizeValue(formattedJson[f.key], f);
      }

      if (f.type === "object_array" && Array.isArray(formattedJson[f.key]) && f.subFields) {
        (formattedJson[f.key] as any[]).forEach((item) => {
          if (item && typeof item === "object") {
            f.subFields!.forEach((sf) => {
              if (item[sf.key] !== undefined) {
                item[sf.key] = sanitizeValue(item[sf.key], sf);
              }
            });
          }
        });
      }

      if (
        (f.type === "abilities" || f.type === "weapon") &&
        Array.isArray(formattedJson[f.key])
      ) {
        formattedJson[f.key] = (formattedJson[f.key] as unknown[]).map(
          (item) => {
            if (typeof item !== "object" || item === null) return item;
            const raw = item as Record<string, unknown>;
            const standardKeys = [
              "id",
              "name",
              "type",
              "description",
              "icon",
              "mode_overrides",
            ];
            const formattedItem: Record<string, unknown> = {
              params: {} as Record<string, unknown>,
            };

            Object.keys(raw).forEach((k) => {
              if (standardKeys.includes(k)) {
                formattedItem[k] = raw[k];
              } else if (k === "params" && typeof raw[k] === "object" && raw[k] !== null) {
                Object.assign(formattedItem.params as Record<string, unknown>, raw[k]);
              } else {
                (formattedItem.params as Record<string, unknown>)[k] = raw[k];
              }
            });

            // Auto-generate id from name if missing
            if (!formattedItem.id) {
              if (
                formattedItem.name &&
                typeof formattedItem.name === "string"
              ) {
                formattedItem.id = formattedItem.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "");
              } else {
                formattedItem.id = Math.random().toString(36).substring(7);
              }
            }

            // Ensure params always exists
            if (
              !formattedItem.params ||
              typeof formattedItem.params !== "object"
            ) {
              formattedItem.params = {};
            }

            // Sanitize subFields inside params
            if (f.subFields) {
              const paramsObj = formattedItem.params as Record<string, unknown>;
              f.subFields.forEach((sf) => {
                if (paramsObj[sf.key] !== undefined) {
                  paramsObj[sf.key] = sanitizeValue(paramsObj[sf.key], sf);
                }
              });
            }

            return formattedItem;
          },
        );
      }
    });
    return formattedJson;
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
        const ext =
          portraits[0].name?.split(".").pop() ||
          portraits[0].previewUrl?.split(".").pop() ||
          "png";
        portraitData = `/api/assets/${game}/heroes/${id}/portrait.${ext}`;
      } else if (portraits.length > 0) {
        portraitData = {};
        for (const p of portraits) {
          const ext =
            p.name?.split(".").pop() || p.previewUrl?.split(".").pop() || "png";
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
                throw new Error(
                  `Ability '${ability.name || ability.id}' references invalid mode override: '${modeId}'`,
                );
              }
            }
          }
        }
      }

      // Ensure Abilities and Weapons are formatted correctly (icons processing)
      fields
        .filter((f) => f.type === "abilities" || f.type === "weapon")
        .forEach((f) => {
          const abilityList = formData[f.key] || [];
          abilityList.forEach((ability: any, i: number) => {
            if (!ability.params) ability.params = {};

            const aIcons =
              abilityIcons[ability._clientId || ability.id || i] || [];
            if (aIcons.length === 1 && aIcons[0].key === "main") {
              const ext =
                aIcons[0].name?.split(".").pop() ||
                aIcons[0].previewUrl?.split(".").pop() ||
                "png";
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
                const ext =
                  icon.name?.split(".").pop() ||
                  icon.previewUrl?.split(".").pop() ||
                  "png";
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
          const portraitSha = await getFileSha(path);
          uploads.push(
            uploadAsset(
              path,
              p.base64,
              portraitSha || undefined,
              `Add portrait ${p.key} for ${id}`,
            ),
          );
        }
      }
      for (const upload of abilityUploads) {
        const assetSha = await getFileSha(upload.path);
        uploads.push(
          uploadAsset(
            upload.path,
            upload.base64,
            assetSha || undefined,
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
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AutoGenerateId />
        {submitError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">
            {submitError}
          </div>
        )}

        {/* Top Actions */}
        <div className="flex justify-between items-center border-b border-gray-200/50 dark:border-gray-800/50 pb-4 mb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/${game}/heroes`)}
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

        <div className="flex flex-wrap gap-3 items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl mb-6">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 text-sm font-medium">
            <Sparkles className="w-5 h-5 text-blue-500" />
            AI Data Generation
          </div>
          <div className="flex items-center gap-3">
            <AIPromptModalWrapper aiPromptMarkdown={aiPromptMarkdown} />
            <ImportDataModalWrapper 
              formatImportedJson={formatImportedJson} 
              onImportSuccess={onImportSuccess} 
              dynamicZodSchema={dynamicZodSchema}
            />
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
            if (f.type === "abilities" || f.type === "weapon") {
              return (
                <div className="col-span-1 md:col-span-2" key={f.key}>
                  <AbilitiesField
                    name={f.key}
                    label={f.label}
                    game={game}
                    abilityIcons={abilityIcons}
                    setAbilityIcons={setAbilityIcons}
                    subFields={f.subFields || []}
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
                    game={game}
                    subFields={f.subFields || []}
                  />
                </div>
              );
            }
            if (
              f.type === "reference" ||
              f.type === "reference_list" ||
              ((f.type === "enum" || f.type === "list") && f.globalEnumId)
            ) {
              const isEnumRef =
                (f.type === "enum" || f.type === "list") && f.globalEnumId;
              const isMultiple =
                f.type === "reference_list" || f.type === "list";
              return (
                <div
                  className={`col-span-1 ${isMultiple ? "md:col-span-2" : ""}`}
                  key={f.key}
                >
                  <Controller
                    name={f.key}
                    control={control}
                    render={({ field }) => (
                      <EntityReferenceField
                        label={f.label}
                        game={game}
                        referenceApiEndpoint={
                          isEnumRef
                            ? `/api/{game}/enums/${f.globalEnumId}`
                            : f.referenceApiEndpoint
                        }
                        referenceValueKey={
                          isEnumRef ? "id" : f.referenceValueKey
                        }
                        referenceLabelKey={
                          isEnumRef ? "name" : f.referenceLabelKey
                        }
                        multiple={
                          f.type === "reference_list" || f.type === "list"
                        }
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
                <div
                  className={`col-span-1 ${f.type === "list" ? "md:col-span-2" : ""}`}
                  key={f.key}
                >
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
            if (f.hasCustomSuffix) {
              return (
                <div className="flex gap-2 w-full" key={f.key}>
                  <div className="flex-1">
                    <FormField
                      label={f.label}
                      required={f.required}
                      type={f.type === "number" ? "number" : "text"}
                      {...register(f.key)}
                      error={!!errors[f.key]}
                      helperText={errors[f.key]?.message as string}
                    />
                  </div>
                  <div className="w-1/3">
                    <FormField
                      label="Unit/Suffix"
                      {...register(`${f.key}_suffix`)}
                      error={!!errors[`${f.key}_suffix`]}
                      helperText={errors[`${f.key}_suffix`]?.message as string}
                    />
                  </div>
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
                slotProps={f.unit ? {
                  input: {
                    endAdornment: (
                      <span className="text-gray-500 text-sm select-none pr-1">
                        {f.unit}
                      </span>
                    )
                  }
                } : undefined}
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
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/${game}/heroes`)}
            >
              Cancel
            </Button>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const data = methods.getValues();
                  navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                  toastSuccess("Form JSON copied to clipboard!");
                }}
              >
                <Copy className="w-4 h-4" />
                Copy JSON
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="shadow-lg shadow-orange-500/20 w-40"
              >
                {submitting ? "Creating..." : "Create Hero"}
              </Button>
            </div>
          </div>
        </div>


      </form>
    </FormProvider>
  );
}
