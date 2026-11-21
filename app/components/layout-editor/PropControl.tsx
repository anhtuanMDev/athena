import { NodeProp } from "./inputs/NodeProp";
import { SpecialProp } from "./inputs/SpecialProp";
import { ValueProp } from "./inputs/ValueProp";
import { isSpecialProp, propIds } from "./utils/prop-values";

import type { PropContext } from "./types";
import type { PropSpec } from "~/lib/screen-model";

/** A prop's input, by its kind: content the app supplies, a prop with its own input, or a value or a field. */
export function PropControl({
  idBase,
  name,
  spec,
  value,
  context,
  error,
  onChange,
  onJsonValidity,
}: {
  idBase: string;
  name: string;
  spec: PropSpec;
  value: unknown;
  context: PropContext;
  error?: string;
  onChange: (value: unknown) => void;
  onJsonValidity: (error: string | null) => void;
}) {
  if (spec.type === "node") {
    return <NodeProp name={name} />;
  }
  const prop = { ids: propIds(idBase, name, error), name, spec, value, error, onChange };
  if (isSpecialProp(spec.type)) {
    return <SpecialProp prop={prop} context={context} />;
  }
  return <ValueProp prop={prop} context={context} onJsonValidity={onJsonValidity} />;
}
