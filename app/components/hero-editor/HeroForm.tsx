import { useState } from "react";

import { abilityLists, withAbilityKeys } from "~/lib/ability-icons";
import { schemaOf } from "~/lib/record-schema";

import { HeroFormInner } from "./HeroFormInner";

import type { StoredHero } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

interface HeroFormProps {
  game: string;
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  stored?: StoredHero;
}

/**
 * A hero's form, from the values it starts with. An AI import (importedRecord)
 * starts it again with the import's values: Edit's keep the hero's id.
 */
export function HeroForm(props: HeroFormProps) {
  const { game, schemas, stored } = props;
  // Every hero schema's ability lists, so switching schemas keeps each ability's key.
  const lists = abilityLists(schemas.flatMap((schema) => (Array.isArray(schema.fields) ? schema.fields : [])));
  const [imports, setImports] = useState(0);
  const [initData, setInitData] = useState<Record<string, unknown>>(() =>
    stored ? withAbilityKeys(stored.content, lists) : { game, id: "", schema_id: schemaOf(schemas, undefined)?.id ?? "", name: "", real_name: "", portrait: "", kit: [] },
  );

  const onImported = (data: Record<string, unknown>) => {
    // Imported abilities get keys of their own, as loaded ones do (see ability-icons.ts).
    setInitData(withAbilityKeys(stored ? { ...data, id: stored.id, game } : data, lists));
    setImports((count) => count + 1);
  };

  return <HeroFormInner key={imports} {...props} initData={initData} hasImported={imports > 0} onImported={onImported} />;
}
