import { inputClass } from "~/components/ui/input-classes";
import { useCategories } from "~/lib/categories-context";
import { sourceFields, type RecordSource, type SchemaInfo } from "~/lib/screen-model";

import { asSource, sortableFields, updatedSource } from "../utils/prop-values";

import { SourceFavorites } from "./SourceFavorites";
import { SourceOrderLimit } from "./SourceOrderLimit";

import type { AppLimits } from "~/lib/screen-policy";

interface SourceInputProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  schemas: SchemaInfo[];
  limits: AppLimits;
  /** The category option for no source. */
  emptyLabel?: string;
}

/** Which records a list block (or a list screen) shows. */
export function SourceInput({ id, value, onChange, schemas, limits, emptyLabel = "The screen's records" }: SourceInputProps) {
  const source = asSource(value);
  const configured = useCategories();
  const categories = configured.filter((category) => schemas.some((schema) => schema.category === category.category));
  const fields = source.category ? sourceFields(schemas, { category: source.category }) : [];
  // The app saves favorites only for favoritable categories, so a favorites list of another is always empty.
  const isFavoritable = configured.find((category) => category.category === source.category)?.favoritable === true;
  const update = (patch: Partial<RecordSource>) => {
    onChange(updatedSource(source, patch));
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Another category's fields and favorites don't carry over. */}
      <select id={id} aria-label="Category" value={source.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined, schema: undefined, sort: undefined, order: undefined, favorites: undefined })} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {categories.map((category) => (
          <option key={category.category} value={category.category}>{category.label}</option>
        ))}
      </select>
      <select aria-label="Schema" value={source.schema ?? ""} disabled={!source.category} onChange={(e) => update({ schema: e.target.value || undefined })} className={inputClass}>
        <option value="">Every schema</option>
        {schemas.filter((schema) => schema.category === source.category).map((schema) => (
          <option key={schema.id} value={schema.id}>{schema.name}</option>
        ))}
      </select>
      <select aria-label="Sort by" value={source.sort ?? ""} disabled={!source.category} onChange={(e) => update({ sort: e.target.value || undefined })} className={inputClass}>
        <option value="">File order</option>
        {sortableFields(fields).map((field) => (
          <option key={field.key} value={field.key}>Sort by {field.label ?? field.key}</option>
        ))}
      </select>
      <SourceOrderLimit source={source} limit={limits.listItems} onUpdate={update} />
      <SourceFavorites source={source} isFavoritable={isFavoritable} onUpdate={update} />
    </div>
  );
}
