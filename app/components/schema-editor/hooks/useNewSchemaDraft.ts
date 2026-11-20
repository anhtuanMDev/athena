import { useState } from "react";

import { useToast } from "~/components/ToastProvider";
import { defaultCategory } from "~/lib/schema-fields";

import type { ImportedSchema } from "../types";
import type { Category } from "~/lib/categories";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/**
 * A new schema's name and category. Until one is picked, the category is the
 * first configured one that has a schema (schema-fields.ts defaultCategory).
 * An imported schema brings its name and category, unless the category isn't
 * one the app shows.
 */
export function useNewSchemaDraft(categories: readonly Category[], schemas: readonly DynamicSchemaFile[]) {
  const { error: toastError } = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked ?? defaultCategory(categories, schemas);

  const acceptImport = (imported: ImportedSchema): boolean => {
    if (Boolean(imported.category) && !categories.some((entry) => entry.category === imported.category)) {
      toastError(`"${String(imported.category)}" isn't a category the app shows: use one of ${categories.map((entry) => entry.category).join(", ")}.`);
      return false;
    }
    if (typeof imported.name === "string" && imported.name !== "") {
      setName(imported.name);
    }
    if (typeof imported.category === "string" && imported.category !== "") {
      setPicked(imported.category);
    }
    return true;
  };

  return { name, setName, category, setCategory: setPicked, acceptImport };
}
