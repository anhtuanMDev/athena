import { Trash2 } from "lucide-react";

import { REMOVE_CLASS } from "./constants";

interface FieldActionsProps {
  isRequired: boolean;
  onRequired: (isRequired: boolean) => void;
  onRemove: () => void;
}

/** A top-level field's "Req" checkbox and its delete button. */
export function FieldActions({ isRequired, onRequired, onRemove }: FieldActionsProps) {
  return (
    <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-start h-full pt-2 lg:pt-0 mt-4 lg:mt-0 pl-0 lg:pl-4">
      <div className="flex flex-row lg:flex-col items-center gap-3 p-2 bg-surface-raised rounded-xl border border-gray-200 dark:border-gray-800/60 shadow-sm mt-7">
        <label className="flex flex-col items-center gap-1.5 cursor-pointer group/req" title="Required Field">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(event) => {
              onRequired(event.target.checked);
            }}
            className="w-4 h-4 rounded border-border-strong bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs font-bold text-ink-muted group-hover/req:text-gray-600 dark:group-hover/req:text-gray-300 uppercase transition-colors">Req</span>
        </label>
        <div className="w-px h-6 lg:w-6 lg:h-px bg-gray-200 dark:bg-gray-700/50" />
        <button type="button" onClick={onRemove} className={`${REMOVE_CLASS} p-1.5`} title="Delete field">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
