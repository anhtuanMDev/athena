import type { Control, UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { useFieldArray, Controller } from "react-hook-form";
import type { ImageEntry } from "~/components/MultiImageUploadField";
import { FormField } from "~/components/FormField";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { MultiImageUploadField } from "~/components/MultiImageUploadField";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface AbilitiesFieldProps {
  name: string;
  label: string;
  control: Control<any>;
  register: UseFormRegister<any>;
  setValue: UseFormSetValue<any>;
  watch: UseFormWatch<any>;
  errors: FieldErrors<any>;
  abilityIcons: Record<string, ImageEntry[]>;
  setAbilityIcons: (icons: Record<string, ImageEntry[]>) => void;
  subFields?: DynamicField[];
  options?: string[];
}

export function AbilitiesField({ name, label, control, register, setValue, watch, errors, abilityIcons, setAbilityIcons, subFields, options }: AbilitiesFieldProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name
  });

  return (
    <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 tracking-wider uppercase">{label || "Kit Abilities"}</h3>
      
      {(errors[name] as any)?.message && (
        <p className="text-sm text-red-500 mb-2">{(errors[name] as any).message as string}</p>
      )}

      <div className="space-y-4">
        {fields.map((field, i) => {
          const abilityErrors = (errors[name] as any)?.[i];
          const dataId = (field as any).id || i.toString();
          
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
                    entries={abilityIcons[dataId] || []}
                    onChange={(newIcons: ImageEntry[]) => setAbilityIcons({ ...abilityIcons, [dataId]: newIcons })}
                    defaultKey="main"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <FormField 
                      label="ID (kebab-case)" 
                      {...register(`${name}.${i}.id` as const)}
                      error={!!abilityErrors?.id}
                      helperText={abilityErrors?.id?.message as string}
                      slotProps={{ inputLabel: { shrink: watch(`${name}.${i}.id`) ? true : undefined } }}
                    />
                    <FormField 
                      label="Name" 
                      {...register(`${name}.${i}.name` as const)}
                      onChange={(e) => {
                        register(`${name}.${i}.name` as const).onChange(e);
                        const newName = e.target.value;
                        const generatedId = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                        setValue(`${name}.${i}.id`, generatedId, { shouldDirty: true, shouldValidate: true });
                      }}
                      error={!!abilityErrors?.name}
                      helperText={abilityErrors?.name?.message as string}
                    />
                    {options && options.length > 0 ? (
                      <Controller
                        name={`${name}.${i}.type` as const}
                        control={control}
                        render={({ field }) => (
                          <DynamicSelectField 
                            label="Type"
                            options={options}
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
                    <div className="mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Custom Parameters</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/50">
                        {subFields.map(sf => {
                          if (sf.type === 'boolean') {
                            return (
                              <div key={sf.key} className="flex items-center gap-3 h-[40px] px-3 border border-gray-200/50 dark:border-gray-700/50 rounded-lg">
                                <input
                                  type="checkbox"
                                  id={`${name}-${i}-params-${sf.key}`}
                                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-800 cursor-pointer"
                                  {...register(`${name}.${i}.params.${sf.key}`)}
                                />
                                <label htmlFor={`${name}-${i}-params-${sf.key}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                  {sf.label}
                                </label>
                              </div>
                            );
                          }
                          return (
                            <FormField
                              key={sf.key}
                              label={sf.label}
                              type={sf.type === 'number' ? 'number' : 'text'}
                              {...register(`${name}.${i}.params.${sf.key}`)}
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
      <button type="button" onClick={() => append({ id: "", name: "", type: "", description: "", params: {} })}
        className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1">
        + Add Ability
      </button>
    </div>
  );
}
