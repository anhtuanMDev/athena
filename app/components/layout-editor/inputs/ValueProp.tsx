import { useState } from "react";

import { initialMode, propHelp } from "../utils/prop-values";

import { BindingSelect } from "./BindingSelect";
import { LiteralInput } from "./LiteralInput";
import { PropFooter } from "./PropFooter";
import { PropLabel } from "./PropLabel";
import { SourceToggle } from "./SourceToggle";

import type { PropContext, PropField, SourceMode } from "../types";

interface ValuePropProps {
  prop: PropField;
  context: PropContext;
  onJsonValidity: (error: string | null) => void;
}

/** A prop that holds a value of its own or reads a field, switched by its toggle. */
export function ValueProp({ prop, context, onJsonValidity }: ValuePropProps) {
  const [mode, setMode] = useState<SourceMode>(() => initialMode(prop.value, context.itemFields, prop.name));
  const switchMode = (next: SourceMode) => {
    if (next === mode) {
      return;
    }
    setMode(next);
    prop.onChange(undefined);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <PropLabel inputId={prop.ids.input} name={prop.name} required={prop.spec.required} />
        <SourceToggle name={prop.name} mode={mode} onChange={switchMode} />
      </div>
      {mode === "field" ? <BindingSelect prop={prop} context={context} /> : <LiteralInput prop={prop} onJsonValidity={onJsonValidity} />}
      <PropFooter ids={prop.ids} help={propHelp(prop.spec, mode)} error={prop.error} />
    </div>
  );
}
