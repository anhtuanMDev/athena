import { Controller, useFormContext } from "react-hook-form";

import { PARAM_INPUT } from "./constants";

import type { GlobalEnum } from "~/schemas/enum";

interface ParamTypeValueProps {
  /** The param's place in the form: options.{i}.params.{j}. */
  path: `options.${number}.params.${number}`;
}

/** A param's type, and its value as that type: a checkbox, a number or text. */
export function ParamTypeValue({ path }: ParamTypeValueProps) {
  const { control, register } = useFormContext<GlobalEnum>();
  return (
    <Controller
      control={control}
      name={`${path}.type`}
      defaultValue="string"
      render={({ field }) => {
        const type = field.value;
        return (
          <>
            <div>
              <select aria-label="Type" {...field} className={PARAM_INPUT}>
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
              </select>
            </div>
            <div>
              {type === "boolean" ? (
                <div className="flex items-center h-full px-1 pt-1">
                  <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                    <input type="checkbox" {...register(`${path}.value`)} className="rounded border-border-strong bg-surface w-4 h-4 text-orange-600 focus:ring-orange-500" />
                    True / False
                  </label>
                </div>
              ) : (
                <input
                  aria-label="Value"
                  type={type === "number" ? "number" : "text"}
                  step={type === "number" ? "any" : undefined}
                  placeholder="Value"
                  {...register(`${path}.value`, { setValueAs: (value: unknown) => (type === "number" && value !== "" ? Number(value) : value) })}
                  className={PARAM_INPUT}
                />
              )}
            </div>
          </>
        );
      }}
    />
  );
}
