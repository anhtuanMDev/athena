import { fieldsForProp, type FieldOption } from "~/lib/screen-model";

import { listOf, newInfoRow } from "../utils/prop-values";

import { AddRowButton } from "./AddRowButton";
import { InfoRowItem } from "./InfoRowItem";

import type { InfoRow } from "../types";

interface InfoRowsInputProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  dataFields: FieldOption[];
  icons: string[];
  /** The app shows this many rows at most. */
  max: number;
}

/** Info rows: label, icon, and a field (or fixed text) for the value. */
export function InfoRowsInput({ id, value, onChange, dataFields, icons, max }: InfoRowsInputProps) {
  const rows = listOf<InfoRow>(value);
  const set = (next: InfoRow[]) => {
    onChange(next.length > 0 ? next : undefined);
  };
  const scalarFields = fieldsForProp(dataFields, { type: "string" });
  return (
    <div id={id} className="space-y-2">
      {rows.map((_, i) => (
        <InfoRowItem key={i} index={i} rows={rows} icons={icons} scalarFields={scalarFields} onRows={set} />
      ))}
      <AddRowButton noun="row" count={rows.length} max={max} onAdd={() => set([...rows, newInfoRow(icons, scalarFields)])} />
    </div>
  );
}
