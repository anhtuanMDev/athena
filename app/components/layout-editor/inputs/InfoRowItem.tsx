import { inputBaseClass } from "~/components/ui/input-classes";
import { isBinding, type FieldOption } from "~/lib/screen-model";

import { IconSelect } from "./IconSelect";
import { RowButtons } from "./RowButtons";

import type { InfoRow } from "../types";

interface InfoRowItemProps {
  index: number;
  rows: InfoRow[];
  icons: string[];
  /** Fields a row's value can be read from. */
  scalarFields: FieldOption[];
  onRows: (next: InfoRow[]) => void;
}

/** One info row: its label, its icon, and a field (or fixed text) for its value. */
export function InfoRowItem({ index, rows, icons, scalarFields, onRows }: InfoRowItemProps) {
  const row = rows[index];
  const position = String(index + 1);
  const isBound = isBinding(row.value);
  const patch = (change: Partial<InfoRow>) => {
    onRows(rows.map((entry, j) => (j === index ? { ...entry, ...change } : entry)));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
      <input aria-label={`Row ${position} label`} value={row.label ?? ""} placeholder="Label" onChange={(e) => patch({ label: e.target.value })} className={`${inputBaseClass} min-w-0 flex-1`} />
      <IconSelect label={`Row ${position} icon`} value={row.icon} icons={icons} className={`${inputBaseClass} w-32`} onChange={(icon) => patch({ icon })} />
      <select aria-label={`Row ${position} value from`} value={isBound ? row.value : ""} onChange={(e) => patch({ value: e.target.value })} className={`${inputBaseClass} w-48`}>
        <option value="">Fixed text</option>
        {isBound && !scalarFields.some((field) => `data.${field.key}` === row.value) && <option value={row.value}>{row.value} (not found)</option>}
        {scalarFields.map((field) => (
          <option key={field.key} value={`data.${field.key}`}>Field: {field.label ?? field.key}</option>
        ))}
      </select>
      {!isBound && <input aria-label={`Row ${position} text`} value={row.value ?? ""} placeholder="Value" onChange={(e) => patch({ value: e.target.value })} className={`${inputBaseClass} w-36`} />}
      <RowButtons noun="row" index={index} items={rows} onItems={onRows} />
    </div>
  );
}
