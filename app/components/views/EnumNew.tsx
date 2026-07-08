import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useToast } from "~/components/ToastProvider";
import { createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { FormField } from "~/components/FormField";
import { Button } from "~/components/ui/button";
import { EnumSchema } from "~/schemas/enum";
import type { GlobalEnum } from "~/schemas/enum";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";

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

export default function EnumNew() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, touchedFields },
  } = useForm<GlobalEnum>({
    resolver: zodResolver(EnumSchema),
    defaultValues: {
      id: "",
      name: "",
      description: "",
      options: [{ id: "", name: "", description: "" }],
    },
  });

  const { fields, prepend, remove } = useFieldArray({
    control,
    name: "options",
  });

  const idValue = register("id").name ? control._formValues.id : "";

  const onSubmit = async (data: GlobalEnum) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!data.id || !/^[a-z0-9-]+$/.test(data.id)) {
        throw new Error("Invalid ID format");
      }

      data.options.forEach((opt, idx) => {
        if (!opt.id)
          opt.id = opt.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
      });

      await createFile(
        `data/${game}/enums/${data.id}.json`,
        data,
        `Add enum: ${data.name}`,
      );
      toastSuccess(`Enum ${data.name} created successfully!`);
      navigate(`/${game}/enums`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setSubmitError(msg);
      toastError(`Failed to create enum: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
            New Global Enum
          </h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Enum Name"
                placeholder="e.g. Damage Types"
                {...register("name")}
                error={!!errors.name}
                helperText={errors.name?.message as string}
              />
              <FormField
                label="Generated ID"
                placeholder="damage-types"
                {...register("id")}
                error={!!errors.id}
                helperText={errors.id?.message as string}
                slotProps={{
                  inputLabel: { shrink: idValue ? true : undefined },
                }}
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
                          placeholder="e.g. hitscan (auto-generates if empty)"
                          {...register(`options.${index}.id` as const)}
                          error={!!errors.options?.[index]?.id}
                          helperText={
                            errors.options?.[index]?.id?.message as string
                          }
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
                          errors.options?.[index]?.description
                            ?.message as string
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
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? "Creating..." : "Create Enum"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
