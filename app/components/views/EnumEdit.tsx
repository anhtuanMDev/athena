import { useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams, Link } from "react-router";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useToast } from "~/components/ToastProvider";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { FormField } from "~/components/FormField";
import { Button } from "~/components/ui/button";
import { EnumSchema } from "~/schemas/enum";
import type { GlobalEnum } from "~/schemas/enum";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "~/lib/use-data";
import { DiffView } from "~/components/DiffView";
import { computeDiff } from "~/lib/diff";
import type { DiffEntry } from "~/lib/diff";
import { isConflictError, updateFile, getFile } from "~/lib/github";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

export default function EnumEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);

  const {
    data: enumResult,
    loading,
    error,
  } = useData<{ content: GlobalEnum; sha: string } | null>(
    () => getFile<GlobalEnum>(`data/${game}/enums/${id}.json`),
    [game, id],
    `${game}-enum-${id}`,
  );

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <LoadErrorState
        title="Failed to Load Enum"
        error={error}
        onBack={() => window.history.back()}
      />
    );
  }
  if (!enumResult) {
    return (
      <div className="w-full py-12">
        <EmptyState
          title="Enum Not Found"
          description="The enum you are trying to edit could not be found or has been deleted."
          action={
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            Edit Enum - {enumResult.content.name}
          </h1>
          <Button
            variant="outline"
            size="small"
            onClick={() => window.history.back()}
          >
            Back
          </Button>
        </CardHeader>
        <CardContent>
          <EditEnumForm
            key={enumResult.sha}
            enumData={enumResult.content}
            sha={enumResult.sha}
            game={game!}
            id={id!}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AutoGenerateOptionId({
  control,
  setValue,
  touchedFields,
  index,
}: any) {
  const nameValue = useWatch({ control, name: `options.${index}.name` });
  const idValue = useWatch({ control, name: `options.${index}.id` });

  useEffect(() => {
    if (
      nameValue &&
      typeof nameValue === "string" &&
      !touchedFields?.options?.[index]?.id
    ) {
      const generatedId = nameValue
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      if (idValue !== generatedId) {
        setValue(`options.${index}.id`, generatedId, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    }
  }, [
    nameValue,
    touchedFields?.options?.[index]?.id,
    setValue,
    idValue,
    index,
  ]);

  return null;
}

function EditEnumForm({
  enumData,
  sha,
  game,
  id,
}: {
  enumData: GlobalEnum;
  sha: string;
  game: string;
  id: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [preview, setPreview] = useState<{
    diffs: DiffEntry[];
    enumJson: string;
    sha: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingCommit, setSubmittingCommit] = useState(false);

  const defaultValues = useMemo(() => {
    return { ...enumData };
  }, [enumData]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid, isDirty, touchedFields },
  } = useForm<GlobalEnum>({
    resolver: zodResolver(EnumSchema),
    defaultValues,
    mode: "onChange",
  });

  const { fields, prepend, remove } = useFieldArray({
    control,
    name: "options",
  });

  const onSubmitPreview = async (formData: GlobalEnum) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      formData.options.forEach((opt) => {
        if (!opt.id)
          opt.id = opt.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
      });

      const parsed = EnumSchema.parse(formData);
      const diffs = computeDiff(enumData, parsed);
      setPreview({ diffs, enumJson: JSON.stringify(parsed), sha });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
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
      const parsedData = JSON.parse(preview.enumJson);
      const parsed = EnumSchema.safeParse(parsedData);
      if (!parsed.success) {
        setSubmitError("Enum data failed validation on commit");
        toastError("Validation failed on commit");
        return;
      }

      await updateFile(
        `data/${game}/enums/${id}.json`,
        parsed.data,
        sha,
        `Update enum: ${parsed.data.name}`,
      );
      toastSuccess(`Enum ${parsed.data.name} updated successfully!`);
      navigate(`/${game}/enums`);
    } catch (err) {
      if (isConflictError(err)) {
        setSubmitError(err.message);
        toastError(err.message);
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
          <input type="hidden" name="_enumJson" value={preview.enumJson} />
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreview(null)}
          >
            Edit Again
          </Button>
          <Button
            type="submit"
            variant="default"
            disabled={submittingCommit || preview.diffs.length === 0}
          >
            {submittingCommit ? "Saving to GitHub..." : "Commit Changes"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmitPreview)} className="space-y-6">
      {submitError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">
          {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Enum Name"
          placeholder="e.g. Damage Types"
          {...register("name")}
          error={!!errors.name}
          helperText={errors.name?.message as string}
        />
        <FormField
          label="ID"
          placeholder="damage-types"
          {...register("id")}
          error={!!errors.id}
          helperText={errors.id?.message as string}
          disabled
        />
        <div className="col-span-1 md:col-span-2">
          <FormField
            label="Description (optional)"
            placeholder="What is this list used for?"
            {...register("description")}
            error={!!errors.description}
            helperText={errors.description?.message as string}
          />
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Options
            </h3>
            <p className="text-xs text-gray-500">
              The values that will be selectable in the schema.
            </p>
          </div>
          <Button
            type="button"
            size="small"
            variant="outline"
            onClick={() => prepend({ id: "", name: "", description: "" })}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Option
          </Button>
        </div>

        {errors.options && typeof errors.options.message === "string" && (
          <div className="text-sm text-red-500 mb-4">
            {errors.options.message}
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="flex gap-3 items-start p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <AutoGenerateOptionId
                control={control}
                setValue={setValue}
                touchedFields={touchedFields}
                index={index}
              />
              <div className="flex-1 grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Label (Name)"
                    placeholder="e.g. Hitscan"
                    {...register(`options.${index}.name` as const)}
                    error={!!errors.options?.[index]?.name}
                    helperText={
                      errors.options?.[index]?.name?.message as string
                    }
                  />
                  <FormField
                    label="Value (ID)"
                    placeholder="e.g. hitscan"
                    {...register(`options.${index}.id` as const)}
                    error={!!errors.options?.[index]?.id}
                    helperText={errors.options?.[index]?.id?.message as string}
                    slotProps={{
                      inputLabel: {
                        shrink: control._formValues.options?.[index]?.id
                          ? true
                          : undefined,
                      },
                    }}
                  />
                </div>
                <FormField
                  label="Description"
                  placeholder="Optional description"
                  {...register(`options.${index}.description` as const)}
                  error={!!errors.options?.[index]?.description}
                  helperText={
                    errors.options?.[index]?.description?.message as string
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove(index)}
                className="mt-6 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {fields.length === 0 && (
            <div className="text-center py-6 text-sm text-gray-500 italic border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
              No options added. Click "Add Option" to begin.
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
        <Button
          type="submit"
          variant="default"
          disabled={!isDirty || !isValid || submitting}
        >
          {submitting ? "Processing..." : "Review Changes"}
        </Button>
      </div>
    </form>
  );
}
