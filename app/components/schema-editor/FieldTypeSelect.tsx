import { Box, Hash, List, ListOrdered, ToggleLeft, Type, type LucideIcon } from "lucide-react";

import { FIELD_TYPES, LABEL_CLASS } from "./constants";

import type { FieldType } from "~/schemas/dynamic-schema";

const TYPE_SELECT_CLASS =
  "block w-full rounded-lg border-border-strong bg-surface-raised pl-9 pr-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors appearance-none";

/** The icon shown in a top-level field's type select, for the types that have one. */
const TYPE_ICONS: Partial<Record<FieldType, LucideIcon>> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  list: List,
  enum: ListOrdered,
  abilities: Box,
  weapon: Box,
};

interface FieldTypeSelectProps {
  type: FieldType;
  onChange: (type: string) => void;
}

/** A top-level field's "Data Type": the select, with the type's icon. */
export function FieldTypeSelect({ type, onChange }: FieldTypeSelectProps) {
  const Icon = TYPE_ICONS[type];
  return (
    <div>
      <label className={LABEL_CLASS}>Data Type</label>
      <div className="relative">
        {Icon && <Icon className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
        <select
          aria-label="Field type"
          value={type}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={TYPE_SELECT_CLASS}
        >
          {FIELD_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
