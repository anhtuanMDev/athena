import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { abilityIcons as loadAbilityIcons, abilityLists, abilityPicturesChanged, iconEntries, picturesChanged } from "~/lib/ability-icons";
import { heroAiPrompt, openedHero } from "~/lib/hero-form";
import { heroRecordSchema, schemaOf } from "~/lib/record-schema";

import type { StoredHero } from "../types";
import type { ImageEntry } from "~/components/MultiImageUploadField";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

interface HeroFormSetup {
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  initData: Record<string, unknown>;
  stored?: StoredHero;
}

/** A stored portrait's pictures, by key; a portrait that's a URL stays in the form's URL field. */
const portraitEntries = (portrait: unknown): ImageEntry[] => (portrait && typeof portrait === "object" ? iconEntries(portrait) : []);

/**
 * A hero's form: its values (from `initData`), the schema it follows and its
 * check, its portraits and abilities' icons (outside the form, so changing
 * them is an edit of its own), and the AI prompt for its fields.
 */
export function useHeroForm({ schemas, enums, initData, stored }: HeroFormSetup) {
  // Every hero schema's ability lists, so switching schemas keeps each ability's key.
  const lists = abilityLists(schemas.flatMap((schema) => (Array.isArray(schema.fields) ? schema.fields : [])));
  const [loadedIcons] = useState(() => loadAbilityIcons(initData, lists));
  const [abilityIcons, setAbilityIcons] = useState<Record<string, ImageEntry[]>>(loadedIcons);
  const [loadedPortraits] = useState(() => portraitEntries(stored?.content.portrait));
  const [portraits, setPortraits] = useState<ImageEntry[]>(loadedPortraits);
  const [schemaId, setSchemaId] = useState(() => schemaOf(schemas, initData.schema_id)?.id ?? "");
  const fields = useMemo(() => schemaOf(schemas, schemaId)?.fields ?? [], [schemas, schemaId]);
  const schema = useMemo(() => heroRecordSchema(fields), [fields]);
  // Edit opens the hero as its form holds it (form-defaults.ts), so an untouched hero opens unchanged.
  const [opened] = useState(() => (stored ? openedHero(initData, fields, { hasPortraitUrl: loadedPortraits.length === 0 }) : { ...initData }));
  const methods = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: opened });
  const prompt = useMemo(() => heroAiPrompt(fields, enums), [fields, enums]);

  const switchSchema = (nextId: string) => {
    setSchemaId(nextId);
    methods.setValue("schema_id", nextId, { shouldDirty: true });
  };

  return {
    methods,
    opened,
    fields,
    schema,
    schemaId,
    switchSchema,
    abilityIcons,
    setAbilityIcons,
    portraits,
    setPortraits,
    prompt,
    picturesEdited: picturesChanged(portraits, loadedPortraits) || abilityPicturesChanged(abilityIcons, loadedIcons),
  };
}
