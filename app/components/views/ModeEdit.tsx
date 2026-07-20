import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { FormField } from "~/components/FormField";
import { type ImageEntry } from "~/components/MultiImageUploadField";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/EmptyState";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import {
  AIPromptModalWrapper,
  ImportDataModalWrapper,
} from "~/components/views/HeroFormModals";
import {
  deleteFile,
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
  buildDynamicZodSchema,
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";
import { type GlobalEnum } from "~/schemas/enum";
import { ModeSchema, type Mode } from "~/schemas/mode";
import { formatImportedJson, generateAiPromptMarkdown } from "~/lib/schema-utils";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";

interface DeleteConfirm {
  mode: string;
  referencingItems: string[];
  referencingHeroes: string[];
  referencingMaps: string[];
}

export default function EditMode() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);
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
      const modeSchemas = schemas.filter((s) => s && s.category === "mode");
      const modeData = await getFile<Mode>(`data/${game}/modes/${id}.json`);

      return {
        schemas: modeSchemas,
        schemaCount: modeSchemas.length,
        enums,
        game: game!,
        modeData: modeData?.content,
        modeSha: modeData?.sha,
      };
    },
    [game, id],
    `${game}-mode-${id}`,
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
      <LoadErrorState
        title="Failed to Load Mode"
        error={fetchError}
        onBack={() => window.history.back()}
      />
    );

  if (!data?.modeData)
    return (
      <div className="w-full py-12">
        <EmptyState
          title="Mode Not Found"
          description="The mode you are trying to edit could not be found or has been deleted."
          action={
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          }
        />
      </div>
    );

  if (data.schemaCount === 0) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No Schema Configured
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              You must create a schema for Modes before editing entries.
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
            Edit Mode: {data.modeData.name}
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
          <ModeForm
            schemas={data.schemas}
            enums={data.enums}
            game={data.game}
            modeData={data.modeData}
            modeSha={data.modeSha!}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ModeForm({
  schemas,
  enums,
  game,
  modeData,
  modeSha,
}: {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  game: string;
  modeData: any;
  modeSha: string;
}) {
  const [formKey, setFormKey] = useState(0);
  const [initData, setInitData] = useState<Record<string, any>>({
    game,
    ...modeData,
    schema_id: modeData.schema_id || schemas[0]?.id || "",
  });

  const handleImportSuccess = (data: Record<string, any>) => {
    setInitData({ ...initData, ...data, id: initData.id }); // preserve ID
    setFormKey((k) => k + 1);
  };

  return (
    <ModeFormInner
      key={formKey}
      schemas={schemas}
      enums={enums}
      game={game}
      initData={initData}
      modeSha={modeSha}
      onImportSuccess={handleImportSuccess}
    />
  );
}

type ModeFormInnerProps = {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  game: string;
  initData: Record<string, any>;
  modeSha: string;
  onImportSuccess: (data: Record<string, any>) => void;
};

function ModeFormInner({
  schemas,
  enums,
  game,
  initData,
  modeSha,
  onImportSuccess,
}: ModeFormInnerProps) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null,
  );

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

  const dynamicZodSchema = useMemo(
    () =>
      buildDynamicZodSchema(fields, ModeSchema, ["id", "name", "description"]),
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
    formState: { errors },
  } = methods;

  const idValue = useWatch({ control, name: "id" });

  const aiPromptMarkdown = useMemo(() => generateAiPromptMarkdown({
    entityName: "Game Mode",
    schemaName: "ModeSchema",
    category: "mode",
    categoryHint: "Think about win conditions, team sizes, time limits, and scoring mechanics.",
    fields,
    enums
  }), [fields, enums]);

  const formatImportedJsonWrapper = (json: Record<string, unknown>) => formatImportedJson(json, fields, game, false);

  const onSubmit = async (formData: any) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const id = formData.id;
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        setSubmitError("Valid Code Name is required to generate ID");
        setSubmitting(false);
        return;
      }

      const abilityUploads: {
        path: string;
        base64: string;
        message: string;
      }[] = [];

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
              const displayPath = `/api/assets/${game}/modes/${id}/abilities/${ability.id}.${ext}`;
              const uploadPath = `public/assets/${game}/modes/${id}/abilities/${ability.id}.${ext}`;
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
                const displayPath = `/api/assets/${game}/modes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
                const uploadPath = `public/assets/${game}/modes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
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

      const uploads = [];
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

      await updateFile(
        `data/${game}/modes/${parsed.id}.json`,
        parsed,
        modeSha,
        `Update mode: ${parsed.name}`,
      );
      toastSuccess(`Mode ${parsed.name} updated successfully!`);
      navigate(`/${game}/modes`);
    } catch (err) {
      if (isConflictError(err)) {
        setSubmitError(err.message);
        toastError(err.message);
        return;
      }
      const msg = (err as Error).message;
      setSubmitError(msg);
      toastError(`Failed to update mode: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  async function handleDeleteCheck() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items = await listDirectory<{ id: string; mode?: string }>(
        game!,
        "items",
        true,
        ["id", "mode"],
      );
      const referencingItems = items
        .filter((item) => item.mode === initData.id)
        .map((item) => item.id);

      const heroes = await listDirectory<{
        id: string;
        kit?: Array<{ mode_overrides?: Record<string, unknown> }>;
      }>(game!, "heroes", true, ["id", "kit"]);
      const referencingHeroes = heroes
        .filter((hero) =>
          hero.kit?.some(
            (a) => a.mode_overrides && initData.id! in a.mode_overrides,
          ),
        )
        .map((hero) => hero.id);

      const maps = await listDirectory<{ id: string; game_modes?: string[] }>(
        game!,
        "maps",
        true,
        ["id", "game_modes"],
      );
      const referencingMaps = maps
        .filter((map) => map.game_modes?.includes(initData.id!))
        .map((map) => map.id);

      setDeleteConfirm({
        mode: initData.id!,
        referencingItems,
        referencingHeroes,
        referencingMaps,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setSubmitError(msg);
      toastError(`Failed to check references: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      try {
        await deleteFile(
          `data/${game}/modes/${initData.id}.json`,
          modeSha,
          `Delete mode: ${initData.id}`,
        );
        toastSuccess("Mode deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setSubmitError(err.message);
          toastError(err.message);
          return;
        }
        throw err;
      }
      navigate(`/${game}/modes`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setSubmitError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (deleteConfirm) {
    return (
      <Card className="border-red-200/50 dark:border-red-800/50 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm">
        <CardHeader>
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">
            Delete Mode: {initData.name}?
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteConfirm.referencingItems.length > 0 && (
            <div className="p-4 bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm backdrop-blur-sm">
              <p className="font-bold text-yellow-800 dark:text-yellow-300">
                This mode is referenced by{" "}
                {deleteConfirm.referencingItems.length} item(s):
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 font-mono mt-1">
                {deleteConfirm.referencingItems.join(", ")}
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-2 font-medium">
                These references will become dangling.
              </p>
            </div>
          )}
          {deleteConfirm.referencingHeroes.length > 0 && (
            <div className="p-4 bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm backdrop-blur-sm">
              <p className="font-bold text-yellow-800 dark:text-yellow-300">
                This mode has mode_overrides in{" "}
                {deleteConfirm.referencingHeroes.length} hero(es):
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 font-mono mt-1">
                {deleteConfirm.referencingHeroes.join(", ")}
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-2 font-medium">
                These overrides will become dangling.
              </p>
            </div>
          )}
          {deleteConfirm.referencingMaps.length > 0 && (
            <div className="p-4 bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm backdrop-blur-sm">
              <p className="font-bold text-yellow-800 dark:text-yellow-300">
                This mode is referenced by{" "}
                {deleteConfirm.referencingMaps.length} map(s):
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 font-mono mt-1">
                {deleteConfirm.referencingMaps.join(", ")}
              </p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-2 font-medium">
                These references will become dangling.
              </p>
            </div>
          )}
          {deleteConfirm.referencingItems.length === 0 &&
            deleteConfirm.referencingHeroes.length === 0 &&
            deleteConfirm.referencingMaps.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 p-2">
                No other entities reference this mode.
              </p>
            )}
          <div className="flex gap-4 pt-4">
            <form onSubmit={handleDeleteConfirm} className="w-1/2">
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting}
                className="w-full shadow-lg shadow-red-500/20"
              >
                {submitting ? "Deleting..." : "Delete Anyway"}
              </Button>
            </form>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeleteConfirm(null);
                setSubmitError(null);
              }}
              className="w-1/2 bg-gray-100 dark:bg-gray-800"
            >
              Cancel
            </Button>
          </div>
          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400 p-2">
              {submitError}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            onClick={() => navigate(`/${game}/modes`)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="shadow-lg shadow-orange-500/20 w-40"
          >
            {submitting ? "Saving..." : "Save Changes"}
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
              formatImportedJson={formatImportedJsonWrapper}
              onImportSuccess={onImportSuccess}
              dynamicZodSchema={dynamicZodSchema}
            />
          </div>
        </div>

        {schemas.length > 1 && (
          <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800 rounded-xl">
            <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">
              Mode Schema Profile
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
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Name"
            placeholder="e.g. Payload"
            {...register("name")}
            error={!!errors.name}
            helperText={errors.name?.message as string}
          />
          <FormField
            label="Description (optional)"
            placeholder="A short summary"
            {...register("description")}
            error={!!errors.description}
            helperText={errors.description?.message as string}
          />
          <FormField
            label="ID (Read Only)"
            disabled
            {...register("id")}
            error={!!errors.id}
            helperText={errors.id?.message as string}
            slotProps={{ inputLabel: { shrink: idValue ? true : undefined } }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <DynamicFieldsRenderer
            fields={fields}
            game={game}
            abilityIcons={abilityIcons}
            setAbilityIcons={setAbilityIcons}
            control={control}
            register={register}
            errors={errors}
            skipFields={["id", "name", "description"]}
          />
        </div>

        <div className="pt-8 mt-8 border-t border-gray-200/50 dark:border-gray-800/50 flex justify-end">
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={handleDeleteCheck}
            className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Mode
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
