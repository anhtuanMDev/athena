import { useFormContext } from "react-hook-form";

import { SchemaProfileSelect } from "~/components/record-form/SchemaProfileSelect";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import { MAP_OWN_KEYS } from "~/lib/map-form";

import { MapIdentityFields } from "./MapIdentityFields";

import type { useMapForm } from "./hooks/useMapForm";
import type { MapStage } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface MapFieldsProps {
  game: string;
  stage: MapStage;
  schemas: DynamicSchemaFile[];
  form: ReturnType<typeof useMapForm>;
}

/** The schema the map follows when there are several, its name (and New's id), and its schema's fields. */
export function MapFields({ game, stage, schemas, form }: MapFieldsProps) {
  const { control, register, formState: { errors } } = useFormContext<Record<string, unknown>>();
  return (
    <>
      {schemas.length > 1 && <SchemaProfileSelect label="Map Schema Profile" schemas={schemas} value={form.schemaId} onChange={form.switchSchema} />}
      <MapIdentityFields stage={stage} />
      {/* The schema's fields as every record form shows them: global enums, object lists, suffixes. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DynamicFieldsRenderer fields={form.fields} game={game} control={control} register={register} errors={errors} skipFields={MAP_OWN_KEYS} />
      </div>
    </>
  );
}
