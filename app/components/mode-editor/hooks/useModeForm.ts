import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { abilityIcons as loadAbilityIcons, abilityLists, abilityPicturesChanged } from "~/lib/ability-icons";
import { fieldsLeftBehind } from "~/lib/record-form";
import { modeRecordSchema, schemaOf } from "~/lib/record-schema";
import { generateAiPromptMarkdown } from "~/lib/schema-utils";

import type { ImageEntry } from "~/components/MultiImageUploadField";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

const MODE_HINT = "Think about win conditions, team sizes, time limits, and scoring mechanics.";

/**
 * A mode's form: its values (from `initData`), the schema it follows and its
 * checks, its abilities' icons, and the AI prompt for its fields. Switching
 * the schema drops the values of fields only the old one had: the strict
 * check would refuse them, and Save would seem to do nothing.
 */
export function useModeForm({ schemas, enums, initData }: { schemas: DynamicSchemaFile[]; enums: GlobalEnum[]; initData: Record<string, unknown> }) {
  // A listed schema is its file as it is: one may have no fields.
  const lists = abilityLists(schemas.flatMap((schema) => (Array.isArray(schema.fields) ? schema.fields : [])));
  const [loadedIcons] = useState(() => loadAbilityIcons(initData, lists));
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>(loadedIcons);
  const [schemaId, setSchemaId] = useState(() => schemaOf(schemas, initData.schema_id)?.id ?? "");
  const fields = useMemo(() => schemaOf(schemas, schemaId)?.fields ?? [], [schemas, schemaId]);
  const schema = useMemo(() => modeRecordSchema(fields), [fields]);
  const methods = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: initData });
  const prompt = useMemo(() => generateAiPromptMarkdown({ entityName: "Game Mode", schemaName: "ModeSchema", category: "mode", categoryHint: MODE_HINT, fields, enums }), [fields, enums]);

  const switchSchema = (nextId: string) => {
    methods.unregister(fieldsLeftBehind(fields, schemaOf(schemas, nextId)?.fields ?? []));
    setSchemaId(nextId);
    methods.setValue("schema_id", nextId, { shouldDirty: true });
  };

  return { methods, fields, schema, schemaId, switchSchema, abilityIcons, setAbilityIcons, prompt, picturesEdited: abilityPicturesChanged(abilityIcons, loadedIcons) };
}
