import { BlockPreview, type PreviewContext } from "~/components/layout-editor/BlockPreview";
import { blockSpec, type PrimitiveManifest, type ScreenBlock, type ScreenFile } from "~/lib/screen-model";

import { PREVIEW_PALETTES } from "./constants";

interface PreviewPhoneProps {
  appearance: ScreenFile["appearance"];
  /** The blocks the preview shows: the visible ones, of the tab it shows. */
  blocks: ScreenBlock[];
  manifest: PrimitiveManifest | null;
  ctx: PreviewContext;
  selectedId: string | null;
  onSelect: (blockId: string) => void;
}

/** The screen as a phone shows it, in its own appearance; a block opens its form. */
export function PreviewPhone({ appearance, blocks, manifest, ctx, selectedId, onSelect }: PreviewPhoneProps) {
  return (
    <div style={PREVIEW_PALETTES[appearance ?? "light"]} className="mx-auto w-full max-w-[375px] overflow-hidden rounded-2xl border border-border-strong bg-page text-ink">
      <div className="max-h-[calc(100dvh-12rem)] space-y-5 overflow-y-auto p-4">
        {blocks.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">Nothing to show yet</p>
        ) : (
          blocks.map((block) => (
            <BlockPreview key={block.id} block={block} spec={blockSpec(manifest, block.type)} ctx={ctx} selected={selectedId === block.id} onSelect={() => onSelect(block.id)} />
          ))
        )}
      </div>
    </div>
  );
}
