import { propHelp } from "../utils/prop-values";

import { PropFooter } from "./PropFooter";
import { PropLabel } from "./PropLabel";
import { SpecialInput } from "./SpecialInput";

import type { PropContext, PropField } from "../types";

interface SpecialPropProps {
  prop: PropField;
  context: PropContext;
}

/** A prop that chooses its own input, across the form's two columns. */
export function SpecialProp({ prop, context }: SpecialPropProps) {
  return (
    <div className="md:col-span-2">
      <div className="mb-1.5">
        <PropLabel inputId={prop.ids.input} name={prop.name} required={prop.spec.required} />
      </div>
      <SpecialInput prop={prop} context={context} />
      <PropFooter ids={prop.ids} help={propHelp(prop.spec, "value")} error={prop.error} />
    </div>
  );
}
