import { Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";

import { EditorModal } from "./EditorModal";

interface ClearFieldsModalProps {
  count: number;
  onCancel: () => void;
  onClear: () => void;
}

/** Asks before Clear All Fields empties the schema's field list. */
export function ClearFieldsModal({ count, onCancel, onClear }: ClearFieldsModalProps) {
  const title = (
    <>
      <Trash2 className="w-5 h-5 text-red-500" /> Clear All Fields
    </>
  );
  return (
    <EditorModal title={title} size="small" onClose={onCancel}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-ink-muted">
          This will remove all <span className="font-semibold text-ink">{count} fields</span> from the schema. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" size="small" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="small" className="bg-red-600 hover:bg-red-700 border-0" onClick={onClear}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Clear All
          </Button>
        </div>
      </div>
    </EditorModal>
  );
}
