import { useFieldArray, Controller, useFormContext } from "react-hook-form";
import type { ImageEntry } from "~/components/MultiImageUploadField";
import { FormField } from "~/components/FormField";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { MultiImageUploadField } from "~/components/MultiImageUploadField";
import type { DynamicField } from "~/schemas/dynamic-schema";
import { slugify } from "~/lib/slug";
import { abilityKey } from "~/lib/ability-icons";

import { EntityReferenceField } from "~/components/EntityReferenceField";

export interface AbilityFieldData {
  /** The key its pictures are kept by while it's edited (see ability-icons.ts). */
  _clientId?: string;
  /** Added in this form: only then does its id follow its name. */
  _isNew?: boolean;
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  params?: Record<string, any>;
}

interface AbilitiesFieldProps {
  name: string;
  label: string;
  game: string;
  /** The pictures of the form's abilities, by abilityKey. Without them, the form has no pictures to save and shows no upload. */
  abilityIcons?: Record<string, ImageEntry[]>;
  setAbilityIcons?: (icons: Record<string, ImageEntry[]>) => void;
  subFields?: DynamicField[];
  /** The schema's ability (or weapon) types; without them, the type is typed freely. */
  options?: string[];
}

export function AbilitiesField({
  name,
  label,
  game,
  abilityIcons,
  setAbilityIcons,
  subFields,
  options,
}: AbilitiesFieldProps) {
  const { control, register, setValue, getValues, formState: { errors } } = useFormContext<any>();
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  return (
    <div className="pt-6 border-t border-border">
      <h3 className="text-sm font-bold text-ink mb-4 tracking-wider uppercase">
        {label || "Kit Abilities"}
      </h3>

      {(errors[name] as any)?.message && (
        <p className="text-sm text-red-500 mb-2">
          {(errors[name] as any).message as string}
        </p>
      )}

      <div className="space-y-4">
        {fields.map((field, i) => {
          const abilityErrors = (errors[name] as any)?.[i];
          const dataId = abilityKey(name, getValues(`${name}.${i}`), i);

          return (
            <div
              key={field.id}
              className="p-4 border border-border rounded-xl bg-surface-raised"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  Ability {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div className="flex flex-col md:flex-row gap-6">
                {abilityIcons && setAbilityIcons && (
                  <div className="w-full md:w-64">
                    <MultiImageUploadField
                      label="Icons"
                      entries={abilityIcons[dataId] || []}
                      onChange={(newIcons: ImageEntry[]) =>
                        setAbilityIcons({ ...abilityIcons, [dataId]: newIcons })
                      }
                      defaultKey="main"
                    />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <input
                    type="hidden"
                    {...register(`${name}.${i}._clientId` as const)}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Controller
                      name={`${name}.${i}.id` as const}
                      control={control}
                      render={({ field }) => (
                        <FormField
                          label="ID (kebab-case)"
                          {...field}
                          error={!!abilityErrors?.id}
                          helperText={abilityErrors?.id?.message as string}
                        />
                      )}
                    />
                    <FormField
                      label="Name"
                      {...register(`${name}.${i}.name` as const)}
                      onChange={(e) => {
                        register(`${name}.${i}.name` as const).onChange(e);
                        if (getValues(`${name}.${i}._isNew`) === true) {
                          const newName = e.target.value;
                          const generatedId = slugify(newName);
                          setValue(`${name}.${i}.id`, generatedId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                      error={!!abilityErrors?.name}
                      helperText={abilityErrors?.name?.message as string}
                    />
                    {options && options.length > 0 ? (
                      // The schema lists the types (e.g. Ultimate, Ability, Weapon, Melee); the app shows the one picked.
                      <Controller
                        name={`${name}.${i}.type` as const}
                        control={control}
                        render={({ field }) => (
                          <DynamicSelectField
                            label="Type"
                            options={options}
                            currentValue={field.value}
                            error={!!abilityErrors?.type}
                            helperText={abilityErrors?.type?.message as string}
                            {...field}
                          />
                        )}
                      />
                    ) : (
                      <FormField
                        label="Type"
                        {...register(`${name}.${i}.type` as const)}
                        error={!!abilityErrors?.type}
                        helperText={abilityErrors?.type?.message as string}
                      />
                    )}
                  </div>
                  <FormField
                    label="Description (optional)"
                    {...register(`${name}.${i}.description` as const)}
                    error={!!abilityErrors?.description}
                    helperText={abilityErrors?.description?.message as string}
                  />

                  {subFields && subFields.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <h4 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-3">
                        Custom Parameters
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-border">
                        {subFields.map((sf) => {
                          if (sf.type === "boolean") {
                            return (
                              <div
                                key={sf.key}
                                className="flex items-center gap-3 h-[40px] px-3 border border-border rounded-lg"
                              >
                                <input
                                  type="checkbox"
                                  id={`${name}-${i}-params-${sf.key}`}
                                  className="w-4 h-4 rounded border-border-strong text-blue-600 focus:ring-blue-500 bg-surface cursor-pointer"
                                  {...register(`${name}.${i}.params.${sf.key}`)}
                                />
                                <label
                                  htmlFor={`${name}-${i}-params-${sf.key}`}
                                  className="text-sm font-medium text-ink cursor-pointer select-none"
                                >
                                  {sf.label}
                                </label>
                              </div>
                            );
                          }
                          const paramError = abilityErrors?.params?.[sf.key];
                          if (
                            sf.type === "reference" ||
                            sf.type === "reference_list" ||
                            ((sf.type === "enum" || sf.type === "list") &&
                              sf.globalEnumId)
                          ) {
                            const isEnumRef =
                              (sf.type === "enum" || sf.type === "list") &&
                              sf.globalEnumId;
                            return (
                              <Controller
                                key={sf.key}
                                name={`${name}.${i}.params.${sf.key}` as const}
                                control={control}
                                render={({ field }) => (
                                  <EntityReferenceField
                                    label={sf.label}
                                    game={game}
                                    referenceApiEndpoint={
                                      isEnumRef
                                        ? `/api/{game}/enums/${sf.globalEnumId}`
                                        : sf.referenceApiEndpoint
                                    }
                                    referenceValueKey={
                                      isEnumRef ? "id" : sf.referenceValueKey
                                    }
                                    referenceLabelKey={
                                      isEnumRef ? "name" : sf.referenceLabelKey
                                    }
                                    multiple={
                                      sf.type === "reference_list" ||
                                      sf.type === "list"
                                    }
                                    error={!!paramError}
                                    helperText={paramError?.message as string}
                                    currentValue={field.value}
                                    {...field}
                                  />
                                )}
                              />
                            );
                          }
                          if (sf.type === "enum" || sf.type === "list") {
                            return (
                              <Controller
                                key={sf.key}
                                control={control}
                                name={`${name}.${i}.params.${sf.key}`}
                                render={({ field, fieldState: { error } }) => (
                                  <DynamicSelectField
                                    label={sf.label}
                                    options={sf.options || []}
                                    multiple={sf.type === "list"}
                                    currentValue={field.value}
                                    error={!!error}
                                    helperText={error?.message as string}
                                    {...field}
                                  />
                                )}
                              />
                            );
                          }
                          if (sf.hasCustomSuffix) {
                            // The record's own unit, saved next to the value as params.<key>_suffix (F3).
                            const suffixError = abilityErrors?.params?.[`${sf.key}_suffix`];
                            return (
                              <div className="flex gap-2 w-full" key={sf.key}>
                                <div className="flex-1">
                                  <FormField
                                    label={sf.label}
                                    type={sf.type === "number" ? "number" : "text"}
                                    {...register(`${name}.${i}.params.${sf.key}`)}
                                    error={!!paramError}
                                    helperText={paramError?.message as string}
                                  />
                                </div>
                                <div className="w-1/3">
                                  <FormField
                                    label="Unit/Suffix"
                                    {...register(`${name}.${i}.params.${sf.key}_suffix`)}
                                    error={!!suffixError}
                                    helperText={suffixError?.message as string}
                                  />
                                </div>
                              </div>
                            );
                          }
                          return (
                            <FormField
                              key={sf.key}
                              label={sf.label}
                              type={sf.type === "number" ? "number" : "text"}
                              {...register(`${name}.${i}.params.${sf.key}`)}
                              error={!!paramError}
                              helperText={paramError?.message as string}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() =>
          append({
            _clientId: `new-${Math.random().toString(36).substring(2, 9)}`,
            _isNew: true,
            id: "",
            name: "",
            type: "",
            description: "",
            params: {},
          })
        }
        className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1"
      >
        + Add Ability
      </button>
    </div>
  );
}
