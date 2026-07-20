import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { type DynamicField } from "~/schemas/dynamic-schema";
import { FormField } from "~/components/FormField";
import { DynamicSelectField } from "~/components/DynamicSelectField";
import { EntityReferenceField } from "~/components/EntityReferenceField";
import { AbilitiesField } from "~/components/views/AbilitiesField";
import { ObjectArrayField } from "~/components/views/ObjectArrayField";
import { type ImageEntry } from "~/components/MultiImageUploadField";

interface DynamicFieldsRendererProps {
  fields: DynamicField[];
  game: string;
  abilityIcons: Record<string, ImageEntry[]>;
  setAbilityIcons: React.Dispatch<React.SetStateAction<Record<string, ImageEntry[]>>>;
  control: Control<any>;
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
  skipFields?: string[];
}

export function DynamicFieldsRenderer({
  fields,
  game,
  abilityIcons,
  setAbilityIcons,
  control,
  register,
  errors,
  skipFields = ["id", "name", "description", "real_name", "portrait"],
}: DynamicFieldsRendererProps) {
  return (
    <>
      {fields.map((f: DynamicField) => {
        if (skipFields.includes(f.key)) return null;
        
        if (f.type === "abilities" || f.type === "weapon") {
          return (
            <div className="col-span-1 md:col-span-2" key={f.key}>
              <AbilitiesField
                name={f.key}
                label={f.label}
                game={game}
                abilityIcons={abilityIcons}
                setAbilityIcons={setAbilityIcons as any}
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
          const isEnumRef = (f.type === "enum" || f.type === "list") && f.globalEnumId;
          const isMultiple = f.type === "reference_list" || f.type === "list";
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
                        ? `/api/${game}/enums/${f.globalEnumId}`
                        : f.referenceApiEndpoint
                    }
                    referenceValueKey={isEnumRef ? "id" : f.referenceValueKey}
                    referenceLabelKey={isEnumRef ? "name" : f.referenceLabelKey}
                    multiple={isMultiple}
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
            <div
              className={`col-span-1 ${f.type === "list" ? "md:col-span-2" : ""}`}
              key={f.key}
            >
              <Controller
                name={f.key}
                control={control}
                render={({ field }) => (
                  <DynamicSelectField
                    name={f.key}
                    label={f.label}
                    options={f.options || []}
                    multiple={f.type === "list"}
                    currentValue={field.value}
                    error={!!errors[f.key]}
                    helperText={errors[f.key]?.message as string}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          );
        }
        
        if (f.type === "boolean") {
          return (
            <div className="flex items-center gap-3 pt-8" key={f.key}>
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-600 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-900"
                {...register(f.key)}
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {f.label}
              </label>
            </div>
          );
        }
        
        return (
          <FormField
            key={f.key}
            label={f.label + (f.unit ? ` (${f.unit})` : "")}
            type={f.type === "number" ? "number" : "text"}
            {...register(f.key, { valueAsNumber: f.type === "number" })}
            error={!!errors[f.key]}
            helperText={errors[f.key]?.message as string}
          />
        );
      })}
    </>
  );
}
