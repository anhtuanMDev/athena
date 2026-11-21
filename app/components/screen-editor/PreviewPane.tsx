import { recordLabel } from "~/lib/screen-starters";

import { PreviewControls } from "./PreviewControls";
import { PreviewPhone } from "./PreviewPhone";
import { hiddenNote, sampleNote } from "./utils/screen-text";

import type { PreviewContext } from "~/components/layout-editor/BlockPreview";
import type { PrimitiveManifest, ScreenBlock, ScreenFile } from "~/lib/screen-model";

interface PreviewPaneProps {
  /** Hidden on narrow screens while the blocks show. */
  isHidden: boolean;
  screen: ScreenFile;
  /** A detail screen's records, and the one shown. */
  sample: { records: Record<string, unknown>[]; index: number; onIndex: (index: number) => void; record: Record<string, unknown> | null };
  tabs: { list: string[]; active: string | undefined; onTab: (tab: string) => void };
  /** The blocks shown, how many are hidden, and what they read. */
  preview: { blocks: ScreenBlock[]; hiddenCount: number; manifest: PrimitiveManifest | null; ctx: PreviewContext };
  selection: { selectedId: string | null; onSelect: (blockId: string) => void };
}

/** The preview: which record and tab it shows, the screen as the app lays it out, and what it leaves out. */
export function PreviewPane({ isHidden, screen, sample, tabs, preview, selection }: PreviewPaneProps) {
  const { hiddenCount } = preview;
  return (
    <aside aria-labelledby="preview-heading" className={`xl:sticky xl:top-0 ${isHidden ? "hidden xl:block" : ""}`}>
      <PreviewControls isDetail={screen.type === "detail"} sample={sample} tabs={tabs} />
      <PreviewPhone appearance={screen.appearance} blocks={preview.blocks} manifest={preview.manifest} ctx={preview.ctx} selectedId={selection.selectedId} onSelect={selection.onSelect} />
      <p className="mt-2 text-xs text-ink-muted">
        {sampleNote(screen.type, sample.record ? recordLabel(sample.record) : undefined)}
        A sketch of each block; the app applies its own styling.
        {hiddenCount > 0 && hiddenNote(hiddenCount)}
      </p>
    </aside>
  );
}
