import { PropControl } from "~/components/layout-editor/PropControl";
import { formProps, type PrimitiveSpec, type ScreenBlock, type ScreenIssue } from "~/lib/screen-model";

import type { BlockActions, BlockContext } from "./types";

interface BlockPropFieldsProps {
  block: ScreenBlock;
  spec: PrimitiveSpec | undefined;
  issues: ScreenIssue[];
  context: BlockContext;
  actions: BlockActions;
}

/** A block's props in the manifest, each with its input and its problem. */
export function BlockPropFields({ block, spec, issues, context, actions }: BlockPropFieldsProps) {
  const props = formProps(spec);
  if (props.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {props.map(([propName, propSpec]) => (
        <PropControl
          key={propName}
          field={{ idBase: `block-${block.id}`, name: propName, spec: propSpec, value: block.props[propName], error: issues.find((issue) => issue.prop === propName)?.message }}
          context={context}
          onChange={(value) => actions.updateProp(block.id, propName, value)}
          onJsonValidity={actions.reportJson(`${block.id}:${propName}`)}
        />
      ))}
    </div>
  );
}
