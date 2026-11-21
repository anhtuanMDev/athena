import { inputClass } from "~/components/ui/input-classes";

import { booleanChoice, defaultPlaceholder, literalKind, textValue, unsetLabel, type LiteralKind } from "../utils/prop-values";

import { JsonInput } from "./JsonInput";

import type { PropField } from "../types";
import type { ReactNode } from "react";

interface LiteralInputProps {
  prop: PropField;
  onJsonValidity: (error: string | null) => void;
}

/** The input of a prop holding its own value: one of the app's options, true or false, JSON, a number, or text. */
export function LiteralInput({ prop, onJsonValidity }: LiteralInputProps) {
  const { ids, spec, value, error, onChange } = prop;
  const isInvalid = error ? true : undefined;
  const current = typeof value === "string" ? value : "";
  const options = spec.options ?? [];
  const placeholder = defaultPlaceholder(spec);
  const unset = <option value="">{unsetLabel(spec)}</option>;
  const controls: Record<LiteralKind, () => ReactNode> = {
    options: () => (
      <select id={ids.input} value={current} aria-describedby={ids.describedBy} aria-invalid={isInvalid} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} className={inputClass}>
        {unset}
        {current && !options.includes(current) && <option value={current}>{current} (not offered by the app)</option>}
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    ),
    boolean: () => (
      <select id={ids.input} value={booleanChoice(value)} aria-describedby={ids.describedBy} aria-invalid={isInvalid} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")} className={inputClass}>
        {unset}
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    ),
    array: () => <JsonInput box={{ id: ids.input, describedBy: ids.describedBy, invalid: Boolean(error), placeholder: "[]" }} value={value} expect="array" onValid={onChange} onValidity={onJsonValidity} />,
    number: () => <input id={ids.input} type="number" inputMode="decimal" value={typeof value === "number" ? value : ""} placeholder={placeholder} aria-describedby={ids.describedBy} aria-invalid={isInvalid} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className={`${inputClass} tabular-nums`} />,
    text: () => <input id={ids.input} type="text" autoComplete="off" spellCheck={false} value={textValue(value)} placeholder={placeholder} aria-describedby={ids.describedBy} aria-invalid={isInvalid} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} className={inputClass} />,
  };
  return controls[literalKind(spec)]();
}
