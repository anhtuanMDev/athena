import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { fieldsLeftBehind } from "~/lib/record-form";
import { mapRecordSchema, schemaOf } from "~/lib/record-schema";

import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/**
 * A map's form: its values (from `initData`), and the schema it follows and
 * its checks. Switching the schema drops the values of fields only the old
 * one had: the strict check would refuse them.
 */
export function useMapForm({ schemas, initData }: { schemas: DynamicSchemaFile[]; initData: Record<string, unknown> }) {
  const [schemaId, setSchemaId] = useState(() => schemaOf(schemas, initData.schema_id)?.id ?? "");
  const fields = useMemo(() => schemaOf(schemas, schemaId)?.fields ?? [], [schemas, schemaId]);
  const schema = useMemo(() => mapRecordSchema(fields), [fields]);
  const methods = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: initData });

  const switchSchema = (nextId: string) => {
    methods.unregister(fieldsLeftBehind(fields, schemaOf(schemas, nextId)?.fields ?? []));
    setSchemaId(nextId);
    methods.setValue("schema_id", nextId, { shouldDirty: true });
  };

  return { methods, fields, schema, schemaId, switchSchema };
}
