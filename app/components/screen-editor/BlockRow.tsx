import { BlockForm } from "./BlockForm";
import { BlockRowButtons } from "./BlockRowButtons";
import { BlockToggle } from "./BlockToggle";

import type { BlockActions, BlockContext, BlockPosition } from "./types";
import type { PrimitiveSpec, ScreenBlock, ScreenIssue } from "~/lib/screen-model";

interface BlockRowProps {
  block: ScreenBlock;
  position: BlockPosition;
  spec: PrimitiveSpec | undefined;
  /** Its problems the editor shows now (required props only after a save was tried). */
  issues: ScreenIssue[];
  /** Whether it's open, what its props' inputs offer, the screen's tabs, and its JSON boxes that don't parse. */
  form: { isExpanded: boolean; context: BlockContext; tabs: string[]; jsonErrorCount: number };
  actions: BlockActions;
}

/** One block of the screen: its row, and when open, its form. */
export function BlockRow({ block, position, spec, issues, form, actions }: BlockRowProps) {
  const name = spec?.name ?? block.type;
  const errorCount = issues.filter((issue) => issue.level === "error").length + form.jsonErrorCount;
  const hasWarnings = issues.some((issue) => issue.level === "warning" && !issue.prop);
  return (
    <li id={`block-${block.id}`} className={`rounded-xl border bg-surface ${form.isExpanded ? "border-border-strong" : "border-border"}`}>
      <div className="flex items-center gap-1 py-1.5 pl-3 pr-1.5">
        <span aria-hidden="true" className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-muted">
          {position.index + 1}
        </span>
        <BlockToggle block={block} name={name} position={position} isExpanded={form.isExpanded} status={{ errorCount, hasWarnings }} onToggle={() => actions.toggle(block.id)} />
        <BlockRowButtons block={block} name={name} position={position} actions={actions} />
      </div>

      <div id={`block-${block.id}-body`} hidden={!form.isExpanded} className="space-y-5 border-t border-border px-4 py-4 md:px-5">
        {form.isExpanded && <BlockForm block={block} index={position.index} spec={spec} issues={issues} form={form} actions={actions} />}
      </div>
    </li>
  );
}
