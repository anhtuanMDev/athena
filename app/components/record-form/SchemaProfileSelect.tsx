import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface SchemaProfileSelectProps {
  /** "Mode Schema Profile", "Hero Schema Profile". */
  label: string;
  schemas: DynamicSchemaFile[];
  value: string;
  onChange: (schemaId: string) => void;
  /** A line under the picker. */
  hint?: string;
  className?: string;
}

/** Which of its category's schemas a record follows, when there are several. */
export function SchemaProfileSelect({ label, schemas, value, onChange, hint, className = "mb-8" }: SchemaProfileSelectProps) {
  return (
    <div className={`${className} p-4 bg-surface-raised border border-border rounded-xl`}>
      <label className="block text-sm font-bold mb-2 text-ink">{label}</label>
      <select
        aria-label={label}
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {schemas.map((schema) => (
          <option key={schema.id} value={schema.id}>
            {schema.name} ({schema.id})
          </option>
        ))}
      </select>
      {hint !== undefined && <p className="text-xs text-ink-muted mt-2">{hint}</p>}
    </div>
  );
}
