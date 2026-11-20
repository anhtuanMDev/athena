import { Plus } from "lucide-react";

import { ADD_SUB_FIELD_CLASS } from "./constants";

import type { ReactNode } from "react";

interface NestedGroupProps {
  /** Whether the group has sub-fields yet. */
  isEmpty: boolean;
  onAdd: () => void;
  /** Its sub-fields (SubFieldList). */
  list: ReactNode;
}

/** An object_array sub-field's own sub-fields: the fields of each object in its nested list. */
export function NestedGroup({ isEmpty, onAdd, list }: NestedGroupProps) {
  return (
    <div className="w-full mt-3 rounded-xl border border-blue-500/30 bg-blue-50/30 dark:bg-blue-900/10 p-4 shadow-sm relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/50" />
      <div className="flex justify-between items-start sm:items-center mb-4 gap-3">
        <div>
          <span className="block font-bold text-sm text-blue-900 dark:text-blue-100">Nested Group Sub-Fields</span>
          <span className="text-xs text-blue-700/80 dark:text-blue-300/80">Define the explicit fields for each object in this nested list.</span>
        </div>
        <button type="button" onClick={onAdd} className={`${ADD_SUB_FIELD_CLASS} px-3 py-1.5 text-xs`}>
          <Plus className="w-3 h-3" /> Add Sub-Field
        </button>
      </div>
      <div className="pl-1">
        {isEmpty ? (
          <div className="py-6 text-center border border-dashed border-blue-200 dark:border-blue-800/50 rounded-lg bg-surface">
            <p className="text-xs font-medium text-blue-800/60 dark:text-blue-300/60">No nested sub-fields configured.</p>
          </div>
        ) : (
          list
        )}
      </div>
    </div>
  );
}
