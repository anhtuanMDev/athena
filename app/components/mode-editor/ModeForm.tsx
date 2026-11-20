import { useState } from "react";

import { abilityLists, withAbilityKeys } from "~/lib/ability-icons";
import { editedAfterImport } from "~/lib/record-form";
import { schemaOf } from "~/lib/record-schema";

import { ModeFormInner } from "./ModeFormInner";

import type { StoredMode } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

interface ModeFormProps {
  game: string;
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  stored?: StoredMode;
}

/** What a new mode starts with, or the loaded one with its schema and its abilities' keys. */
function startingValues({ game, schemas, stored }: Omit<ModeFormProps, "enums">): Record<string, unknown> {
  const lists = abilityLists(schemas.flatMap((schema) => (Array.isArray(schema.fields) ? schema.fields : [])));
  const firstSchema = schemaOf(schemas, undefined)?.id ?? "";
  if (!stored) {
    return { game, id: "", schema_id: firstSchema, name: "", description: "" };
  }
  const own = stored.content.schema_id;
  return withAbilityKeys({ game, ...stored.content, schema_id: typeof own === "string" && own !== "" ? own : firstSchema }, lists);
}

/**
 * A mode's form, from the values it starts with. An AI import starts it
 * again: New takes the import's values, Edit lays them over the mode's
 * (editedAfterImport) and keeps its id.
 */
export function ModeForm(props: ModeFormProps) {
  const { schemas, stored } = props;
  const [imports, setImports] = useState(0);
  const [initData, setInitData] = useState(() => startingValues(props));
  const lists = abilityLists(schemas.flatMap((schema) => (Array.isArray(schema.fields) ? schema.fields : [])));

  const onImported = (data: Record<string, unknown>) => {
    // Imported abilities get keys of their own, as loaded ones do (see ability-icons.ts).
    setInitData((current) => withAbilityKeys(stored ? editedAfterImport({ current, imported: data, schemas }) : data, lists));
    setImports((count) => count + 1);
  };

  return <ModeFormInner key={imports} {...props} initData={initData} hasImported={imports > 0} onImported={onImported} />;
}
