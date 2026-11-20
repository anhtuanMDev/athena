import { LayoutTemplate, Settings2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

import { BackToSchemas } from "./BackToSchemas";

import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface EditSchemaHeaderProps {
  game: string;
  /** The schema's file name, from the page's address. */
  id: string;
  schema: DynamicSchemaFile;
  isSubmitting: boolean;
  /** Save needs a field: an edited schema can't be saved empty. */
  hasFields: boolean;
}

const WIDE_ON_PHONES = "w-full sm:w-auto";

/** An edited schema's title, id and category, with App Screens, Delete, Discard Changes and Save. */
export function EditSchemaHeader({ game, id, schema, isSubmitting, hasFields }: EditSchemaHeaderProps) {
  const navigate = useNavigate();
  const go = (to: string) => () => {
    void navigate(to);
  };
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <BackToSchemas game={game} />
        <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-orange-500" />
          Edit Schema: {schema.name}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm text-ink-muted font-mono bg-surface-raised px-2 py-1 rounded">ID: {schema.id}</span>
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded capitalize">{schema.category}</span>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
        <Button type="button" variant="outline" onClick={go(`/${game}/screens`)} className={`border-blue-500 text-blue-600 hover:bg-blue-50 ${WIDE_ON_PHONES}`}>
          <LayoutTemplate className="w-4 h-4 mr-2" />
          App Screens
        </Button>
        <Button type="button" variant="ghost" onClick={go(`/${game}/schemas/${id}/delete`)} className={`text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 ${WIDE_ON_PHONES}`}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Schema
        </Button>
        <Button type="button" variant="outline" onClick={go(`/${game}/schemas`)} className={WIDE_ON_PHONES}>
          Discard Changes
        </Button>
        <Button type="submit" disabled={isSubmitting || !hasFields} className={`shadow-lg px-8 ${WIDE_ON_PHONES}`}>
          {isSubmitting ? "Saving..." : "Save Schema"}
        </Button>
      </div>
    </div>
  );
}
