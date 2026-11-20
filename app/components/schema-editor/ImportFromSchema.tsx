import { useState } from "react";

import { Button } from "~/components/ui/button";

import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface ImportFromSchemaProps {
  /** The schemas offered: the same category's others. */
  schemas: DynamicSchemaFile[];
  onImport: (schema: DynamicSchemaFile) => void;
}

/** "Import Schema": another schema's fields, picked from a list. */
export function ImportFromSchema({ schemas, onImport }: ImportFromSchemaProps) {
  const [schemaId, setSchemaId] = useState("");
  const importPicked = () => {
    const picked = schemas.find((schema) => schema.id === schemaId);
    if (picked) {
      onImport(picked);
      setSchemaId("");
    }
  };
  return (
    <div className="flex items-center gap-2 mr-4">
      <select
        aria-label="Import fields from schema"
        value={schemaId}
        onChange={(event) => {
          setSchemaId(event.target.value);
        }}
        className="block w-48 rounded-lg border-border-strong bg-surface px-3 py-1.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
      >
        <option value="">Import Schema</option>
        {schemas.map((schema) => (
          <option key={schema.id} value={schema.id}>
            {schema.name} ({Array.isArray(schema.fields) ? schema.fields.length : 0} fields)
          </option>
        ))}
      </select>
      <Button type="button" onClick={importPicked} disabled={schemaId === ""} size="small" variant="outline">
        Import
      </Button>
    </div>
  );
}
