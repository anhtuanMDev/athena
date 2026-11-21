import { NodeProp } from "./inputs/NodeProp";
import { SpecialProp } from "./inputs/SpecialProp";
import { ValueProp } from "./inputs/ValueProp";
import { isSpecialProp, propIds } from "./utils/prop-values";

import type { PropContext } from "./types";
import type { PropSpec } from "~/lib/screen-model";

interface PropControlProps {
  /** The prop: the base of its input's ids, its name, its manifest entry, its value and its error. */
  field: { idBase: string; name: string; spec: PropSpec; value: unknown; error?: string };
  context: PropContext;
  onChange: (value: unknown) => void;
  onJsonValidity: (error: string | null) => void;
}

/** A prop's input, by its kind: content the app supplies, a prop with its own input, or a value or a field. */
export function PropControl({ field, context, onChange, onJsonValidity }: PropControlProps) {
  const { idBase, name, spec, value, error } = field;
  if (spec.type === "node") {
    return <NodeProp name={name} />;
  }
  const prop = { ids: propIds(idBase, name, error), name, spec, value, error, onChange };
  if (isSpecialProp(spec.type)) {
    return <SpecialProp prop={prop} context={context} />;
  }
  return <ValueProp prop={prop} context={context} onJsonValidity={onJsonValidity} />;
}
