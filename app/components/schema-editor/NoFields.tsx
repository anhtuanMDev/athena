import { Plus, Settings2 } from "lucide-react";

import { Button } from "~/components/ui/button";

interface NoFieldsProps {
  onAdd: () => void;
}

/** A schema with no fields yet: where to start. */
export function NoFields({ onAdd }: NoFieldsProps) {
  return (
    <div className="text-center py-16 text-ink-muted border-2 border-dashed border-border rounded-2xl bg-surface-raised">
      <div className="mx-auto w-16 h-16 bg-surface-raised rounded-full flex items-center justify-center mb-4">
        <Settings2 className="w-8 h-8 text-ink-muted" />
      </div>
      <h3 className="text-lg font-medium text-ink mb-1">No fields defined</h3>
      <p className="mb-6">Start building your schema by adding the first field.</p>
      <Button type="button" onClick={onAdd} variant="outline" className="flex items-center gap-2 mx-auto">
        <Plus className="w-4 h-4" /> Add Field
      </Button>
    </div>
  );
}
