import type { Control, UseFormRegister, FieldErrors } from "react-hook-form";
import { useFieldArray, Controller } from "react-hook-form";
import { FormField } from "~/components/FormField";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { EntityReferenceField } from "~/components/EntityReferenceField";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface ObjectArrayFieldProps {
  name: string;
  label: string;
  game: string;
  control: Control<any>;
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  subFields: DynamicField[];
}

export function ObjectArrayField({ name, label, game, control, register, errors, subFields }: ObjectArrayFieldProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name
  });

  if (!subFields || subFields.length === 0) {
    return (
      <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 tracking-wider uppercase">{label}</h3>
        <p className="text-sm text-red-500">Error: No sub-fields configured for this Object Group.</p>
      </div>
    );
  }

  return (
    <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 tracking-wider uppercase">{label}</h3>
      
      {(errors[name] as any)?.message && (
        <p className="text-sm text-red-500 mb-2">{(errors[name] as any).message as string}</p>
      )}

      <div className="space-y-4">
        {fields.map((field, i) => {
          const itemErrors = (errors[name] as any)?.[i];
          
          return (
            <div key={field.id} className="p-4 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Item {i + 1}</span>
                <button type="button" onClick={() => remove(i)}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">Remove</button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subFields.map(sf => {
                  const error = itemErrors?.[sf.key];
                  if (sf.type === 'boolean') {
                    return (
                      <div key={sf.key} className="flex items-center gap-3 h-[40px] px-3 border border-gray-200/50 dark:border-gray-700/50 rounded-lg">
                        <input
                          type="checkbox"
                          id={`${name}-${i}-${sf.key}`}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-800 cursor-pointer"
                          {...register(`${name}.${i}.${sf.key}`)}
                        />
                        <label htmlFor={`${name}-${i}-${sf.key}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                          {sf.label}
                        </label>
                      </div>
                    );
                  }
                  if (sf.type === "reference" || sf.type === "reference_list" || ((sf.type === "enum" || sf.type === "list") && sf.globalEnumId)) {
                    const isEnumRef = (sf.type === "enum" || sf.type === "list") && sf.globalEnumId;
                    return (
                      <Controller
                        key={sf.key}
                        name={`${name}.${i}.${sf.key}` as const}
                        control={control}
                        render={({ field }) => (
                          <EntityReferenceField
                            label={sf.label}
                            game={game}
                            referenceApiEndpoint={isEnumRef ? `/api/{game}/enums/${sf.globalEnumId}` : sf.referenceApiEndpoint}
                            referenceValueKey={isEnumRef ? "id" : sf.referenceValueKey}
                            referenceLabelKey={isEnumRef ? "name" : sf.referenceLabelKey}
                            multiple={sf.type === "reference_list" || sf.type === "list"}
                            error={!!error}
                            helperText={error?.message as string}
                            currentValue={field.value}
                            {...field}
                          />
                        )}
                      />
                    );
                  }
                  if (sf.type === 'enum' || sf.type === 'list') {
                    return (
                      <DynamicSelectField
                        key={sf.key}
                        label={sf.label}
                        options={sf.options || []}
                        multiple={sf.type === 'list'}
                        {...register(`${name}.${i}.${sf.key}`)}
                        error={!!error}
                        helperText={error?.message as string}
                      />
                    );
                  }
                  return (
                    <FormField
                      key={sf.key}
                      label={sf.label}
                      type={sf.type === 'number' ? 'number' : 'text'}
                      {...register(`${name}.${i}.${sf.key}`)}
                      error={!!error}
                      helperText={error?.message as string}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => append({})}
        className="mt-4 px-4 py-2 border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full md:w-auto text-sm font-medium"
      >
        + Add Item
      </button>
    </div>
  );
}
