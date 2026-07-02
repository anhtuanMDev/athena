import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.schema";
import { SchemaFileSchema, type SchemaFile } from "~/schemas/schema-file";
import { getFile, updateFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { computeDiff, type DiffEntry } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { useState } from "react";
import { assertSafeGameSlug, assertSafeStatFieldKey } from "~/lib/safe-path";

type StatFieldType = "number" | "text" | "boolean" | "list";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const file = await getFile<SchemaFile>(`data/${params.game}/schema.json`);
  if (!file) throw data("Schema not found", { status: 404 });
  return { schema: file.content, sha: file.sha, game: params.game };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const sha = formData.get("sha") as string;

  const roles = (formData.get("roles") as string || "").split(",").map((s) => s.trim()).filter(Boolean);
  const abilityTypes = (formData.get("ability_types") as string || "").split(",").map((s) => s.trim()).filter(Boolean);

  const rawStatFields: Record<string, { label: string; unit: string; type: StatFieldType }> = {};
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^stat_field_(.+)_(label|unit|type)$/);
    if (match) {
      const fieldKey = match[1];
      assertSafeStatFieldKey(fieldKey);
      const fieldProp = match[2] as "label" | "unit" | "type";
      rawStatFields[fieldKey] = rawStatFields[fieldKey] ?? { label: "", unit: "", type: "number" as StatFieldType };
      if (fieldProp === "type") {
        rawStatFields[fieldKey][fieldProp] = value as StatFieldType;
      } else {
        rawStatFields[fieldKey][fieldProp] = value as string;
      }
    }
  }

  const schema: SchemaFile = { roles, ability_types: abilityTypes, stat_fields: rawStatFields };
  const parsed = SchemaFileSchema.safeParse(schema);
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: schema, sha, intent: "validate" as const }, { status: 400 });
  }

  const current = await getFile<SchemaFile>(`data/${params.game}/schema.json`);
  if (!current) return data({ errors: { _form: ["Could not read current schema"] } as const }, { status: 500 });

  if (intent === "commit") {
    await updateFile(`data/${params.game}/schema.json`, parsed.data, current.sha, `Update schema: ${params.game}`);
    return data({ success: true as const, sha });
  }

  const diffs = computeDiff(current.content, parsed.data);
  return data({ diffs, values: parsed.data, sha: current.sha, intent: "preview" as const, game: params.game });
}

export default function SchemaEditor({ loaderData, actionData }: Route.ComponentProps) {
  const { schema } = loaderData;
  const [preview, setPreview] = useState<{ diffs: DiffEntry[]; values: SchemaFile; sha: string } | null>(null);

  const previewData = actionData && "diffs" in actionData && "intent" in actionData
    ? actionData as { diffs: DiffEntry[]; values: SchemaFile; sha: string; intent: string }
    : null;
  const showDiffs = previewData?.diffs ?? preview?.diffs ?? null;
  const currentSha = previewData?.sha ?? preview?.sha;
  const currentValues = previewData?.values ?? preview?.values;

  if (showDiffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Schema Changes</h1>
        <DiffView diffs={showDiffs} />
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="commit" />
          <input type="hidden" name="sha" value={currentSha} />
          <input type="hidden" name="roles" value={currentValues?.roles?.join(",") ?? schema.roles.join(",")} />
          <input type="hidden" name="ability_types" value={currentValues?.ability_types?.join(",") ?? schema.ability_types.join(",")} />
          <Button type="submit">Confirm Commit</Button>
          <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
        </Form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Schema: {loaderData.game}</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="intent" value="validate" />
            <input type="hidden" name="sha" value={loaderData.sha} />

            <div>
              <label htmlFor="roles" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Roles (comma-separated)</label>
              <input
                id="roles"
                name="roles"
                type="text"
                defaultValue={schema.roles.join(", ")}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="ability_types" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ability Types (comma-separated)</label>
              <input
                id="ability_types"
                name="ability_types"
                type="text"
                defaultValue={schema.ability_types.join(", ")}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Stat Fields</h3>
              <div className="space-y-2">
                {Object.entries(schema.stat_fields).map(([key, field]) => (
                  <div key={key} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Key</label>
                      <input name={`stat_field_${key}_key`} defaultValue={key} readOnly className="block w-full rounded border-gray-300 bg-gray-50 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Label</label>
                      <input name={`stat_field_${key}_label`} defaultValue={field.label} className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    <div className="w-16">
                      <label className="text-xs text-gray-500">Unit</label>
                      <input name={`stat_field_${key}_unit`} defaultValue={field.unit} className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    <div className="w-20">
                      <label className="text-xs text-gray-500">Type</label>
                      <select name={`stat_field_${key}_type`} defaultValue={field.type} className="block w-full rounded border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                        <option value="number">number</option>
                        <option value="text">text</option>
                        <option value="boolean">boolean</option>
                        <option value="list">list</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit">Preview Changes</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
