import { Copy, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";

import type { ScreenBlock } from "~/lib/screen-model";

interface BlockFooterProps {
  block: ScreenBlock;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** A block's type and id, and its duplicate and remove buttons. */
export function BlockFooter({ block, onDuplicate, onRemove }: BlockFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="font-mono text-xs text-ink-muted">
        {block.type} · id {block.id}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="small" onClick={onDuplicate}>
          <Copy aria-hidden="true" className="mr-1.5 size-4" />
          Duplicate
        </Button>
        <Button type="button" variant="ghost" size="small" color="error" onClick={onRemove}>
          <Trash2 aria-hidden="true" className="mr-1.5 size-4" />
          Remove
        </Button>
      </div>
    </div>
  );
}
