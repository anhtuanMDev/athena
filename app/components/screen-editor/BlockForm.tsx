import { bindingPath, formProps, isBinding, type PrimitiveSpec, type ScreenBlock, type ScreenIssue } from "~/lib/screen-model";

import { BlockFooter } from "./BlockFooter";
import { BlockNotes } from "./BlockNotes";
import { BlockPropFields } from "./BlockPropFields";
import { BlockTabSelect } from "./BlockTabSelect";

import type { BlockActions, BlockContext } from "./types";

interface BlockFormProps {
  block: ScreenBlock;
  index: number;
  spec: PrimitiveSpec | undefined;
  issues: ScreenIssue[];
  /** What the props' inputs offer, and the screen's tabs. */
  form: { context: BlockContext; tabs: string[] };
  actions: BlockActions;
}

/** An open block: its problems, its tab, its props, and its duplicate and remove buttons. */
export function BlockForm({ block, index, spec, issues, form, actions }: BlockFormProps) {
  const formNames = new Set(formProps(spec).map(([name]) => name));
  // Issues that no prop field shows: block-wide ones, and props outside the form.
  const notes = issues.filter((issue) => !issue.prop || !formNames.has(issue.prop));
  const strayProps = Object.keys(block.props).filter((name) => spec !== undefined && !formNames.has(name));
  return (
    <>
      <BlockNotes notes={notes} strayProps={strayProps} onRemoveProps={(names) => actions.removeProps(block.id, names)} />
      {spec?.list && (
        <p className="text-xs text-ink-muted">
          This block repeats for each{" "}
          {isBinding(block.props.items) ? `entry of ${bindingPath(block.props.items)}` : "record"}; pick fields under
          “Each entry” for its item props.
        </p>
      )}
      {form.tabs.length > 0 && block.type !== "tab_bar" && <BlockTabSelect block={block} tabs={form.tabs} onTab={(tab) => actions.patch(block.id, { tab })} />}
      <BlockPropFields block={block} spec={spec} issues={issues} context={form.context} actions={actions} />
      <BlockFooter block={block} onDuplicate={() => actions.duplicate(index)} onRemove={() => actions.remove(index)} />
    </>
  );
}
