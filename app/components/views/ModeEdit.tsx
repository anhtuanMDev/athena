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
  getFile,
  getFileSha,
  isConflictError,
  listDirectory,
  updateFile,
  uploadAsset,
} from "~/lib/github";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import { modeRecordSchema } from "~/lib/record-schema";
import { abilityIcons as loadAbilityIcons, abilityLists, applyAbilityIcons, withAbilityKeys } from "~/lib/ability-icons";
import { asStored } from "~/lib/as-stored";
import {
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";
import { type GlobalEnum } from "~/schemas/enum";
import { type Mode } from "~/schemas/mode";
import { formatImportedJson, generateAiPromptMarkdown } from "~/lib/schema-utils";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import { UnknownKeysNotice } from "~/components/UnknownKeysNotice";
import { unknownKeys } from "~/lib/unknown-keys";

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
      <div className="w-full space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-48 bg-border rounded-lg"></div>
        <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-border rounded-lg"></div>
            <div className="h-12 bg-border rounded-lg"></div>
          </div>
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-40 bg-border rounded-lg mt-8"></div>
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
            <h3 className="text-lg font-semibold text-ink">
              No Schema Configured
            </h3>
            <p className="text-sm text-ink-muted mt-2 mb-4">
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
          <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">
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
  modeData: Record<string, unknown>;
  modeSha: string;
}) {
  const [formKey, setFormKey] = useState(0);
  const lists = abilityLists(schemas.flatMap((s) => s.fields ?? []));
  const [initData, setInitData] = useState<Record<string, unknown>>(() => withAbilityKeys({
    game,
    ...modeData,
    schema_id: modeData.schema_id || schemas[0]?.id || "",
  }, lists));

  const handleImportSuccess = (data: Record<string, unknown>) => {
    setInitData(withAbilityKeys({ ...initData, ...data, id: initData.id }, lists)); // preserve ID
    setFormKey((k) => k + 1);
  };

  return (
    <ModeFormInner
      key={formKey}
      schemas={schemas}
      enums={enums}
      game={game}
      initData={initData}
      stored={modeData}
      modeSha={modeSha}
      onImportSuccess={handleImportSuccess}
    />
  );
}

type ModeFormInnerProps = {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  game: string;
  initData: Record<string, unknown>;
  /** The mode as loaded: a save changes only what was edited (asStored). */
  stored: Record<string, unknown>;
  modeSha: string;
  onImportSuccess: (data: Record<string, unknown>) => void;
};

function ModeFormInner({
  schemas,
  enums,
  game,
  initData,
  stored,
  modeSha,
  onImportSuccess,
}: ModeFormInnerProps) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [abilityIcons, setAbilityIcons] = useState<
    Record<string, ImageEntry[]>
  >(() => loadAbilityIcons(initData, abilityLists(schemas.flatMap((s) => s.fields ?? []))));

  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    (initData.schema_id as string) || schemas[0]?.id || "",
  );
  const activeSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) || schemas[0],
    [schemas, selectedSchemaId],
  );
  const fields = activeSchema?.fields || [];

  const dynamicZodSchema = useMemo(
    () =>
      modeRecordSchema(fields),
    [fields],
  );

  const methods = useForm<Record<string, unknown>>({
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

  const onSubmit = async (formData: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const id = formData.id as string;
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        setSubmitError("Valid Code Name is required to generate ID");
        setSubmitting(false);
        return;
      }

      // Each ability's icon, from its pictures (see ability-icons.ts).
      const { uploads: abilityUploads } = applyAbilityIcons(formData, (path) => methods.getValues(path), abilityLists(fields), abilityIcons, `${game}/modes/${id}`);

      const parsed = dynamicZodSchema.parse(formData) as Record<string, unknown>;

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

      // What the form filled in for keys the mode had no value for doesn't count as an edit.
      await updateFile(
        `data/${game}/modes/${parsed.id}.json`,
        asStored(stored, parsed, dynamicZodSchema),
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

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {submitError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">
            {submitError}
          </div>
        )}
        <UnknownKeysNotice keys={unknownKeys(initData, dynamicZodSchema)} rawEditor={`/${game}/raw/modes/${initData.id}`} />

        {/* Top Actions */}
        <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
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
            className="shadow-lg w-40"
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
          <div className="mb-8 p-4 bg-surface-raised border border-border rounded-xl">
            <label className="block text-sm font-bold mb-2 text-ink">
              Mode Schema Profile
            </label>
            <select aria-label="Mode Schema Profile"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
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

        <div className="pt-8 mt-8 border-t border-border flex justify-end">
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            // The delete page checks what uses the mode and removes its pictures too.
            onClick={() => navigate(`/${game}/modes/${initData.id}/delete`)}
            className="bg-red-600 hover:bg-red-700 shadow-lg"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Mode
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
