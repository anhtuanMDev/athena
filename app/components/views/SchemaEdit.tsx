import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { SchemaFileSchema, type SchemaFile } from "~/schemas/schema-file";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { computeDiff } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug, assertSafeStatFieldKey } from "~/lib/safe-path";

type StatFieldType = "number" | "text" | "boolean" | "list";

export default function SchemaEditor() {
  const { game } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    const file = await getFile<SchemaFile>(`data/${game}/schema.json`);
    if (!file) {
      return {
        schema: {
          roles: ["damage", "tank", "support"],
          ability_types: ["passive", "weapon", "ability", "ultimate"],
          stat_fields: { health: { type: "number", label: "Health", unit: "HP" } }
        },
        sha: null,
        game
      };
    }
    return { schema: file.content, sha: file.sha, game };
  }, [game]);

  const [step, setStep] = useState<"form" | "preview">("form");
  const [diffs, setDiffs] = useState<import("~/lib/diff").DiffEntry[] | null>(null);
  const [commitSchemaJson, setCommitSchemaJson] = useState<string | null>(null);
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]> | null>(null);

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationErrors(null);
    setCommitError(null);
    const formData = new FormData(e.currentTarget);

    if (!loaderData) {
      setCommitError("Schema not loaded");
      return;
    }

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
      setValidationErrors(parsed.error.flatten().fieldErrors as unknown as Record<string, string[]>);
      return;
    }

    const resultDiffs = computeDiff(loaderData.schema, parsed.data);
    setDiffs(resultDiffs);
    setCommitSchemaJson(JSON.stringify(parsed.data));
    setCommitSha(loaderData.sha);
    setStep("preview");
  }

  async function handleCommit() {
    if (!commitSchemaJson) return;
    setCommitError(null);
    let schemaData: unknown;
    try { schemaData = JSON.parse(commitSchemaJson); } catch {
      setCommitError("Invalid schema data in commit");
      return;
    }
    const parsed = SchemaFileSchema.safeParse(schemaData);
    if (!parsed.success) {
      setCommitError("Schema failed validation on commit");
      return;
    }
    try {
      if (!commitSha) {
        // use createFile from github.ts
        const { createFile } = await import("~/lib/github");
        await createFile(`data/${game}/schema.json`, parsed.data, `Create schema: ${game}`);
      } else {
        await updateFile(`data/${game}/schema.json`, parsed.data, commitSha, `Update schema: ${game}`);
      }
      navigate(0);
    } catch (err) {
      if (isConflictError(err)) {
        setCommitError("Conflict: file was modified since loading. Refresh and re-apply.");
      } else {
        throw err;
      }
    }
  }

  if (loading) return (
    <div className="max-w-2xl space-y-6">
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
            <div className="h-10 w-full bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
          <div>
            <div className="h-4 w-56 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
            <div className="h-10 w-full bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
          <div>
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1 h-8 bg-gray-200 dark:bg-gray-800 rounded" />
                  <div className="flex-1 h-8 bg-gray-200 dark:bg-gray-800 rounded" />
                  <div className="w-16 h-8 bg-gray-200 dark:bg-gray-800 rounded" />
                  <div className="w-20 h-8 bg-gray-200 dark:bg-gray-800 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
        </CardContent>
      </Card>
    </div>
  );
  if (loadError) return <div>Error: {(loadError as Error).message}</div>;
  if (!loaderData) return null;

  if (step === "preview" && diffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Schema Changes</h1>
        <DiffView diffs={diffs} />
        {commitError && <p className="text-sm text-red-500">{commitError}</p>}
        <div className="flex gap-2">
          <Button onClick={handleCommit}>Confirm Commit</Button>
          <Button onClick={() => setStep("form")} variant="secondary">Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Schema: {game}</h1>
        </CardHeader>
        <CardContent>
          {commitError && <p className="text-sm text-red-500 mb-4">{commitError}</p>}
          <form onSubmit={handlePreview} className="space-y-6">
            <div>
              <label htmlFor="roles" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Roles (comma-separated)</label>
              <input
                id="roles"
                name="roles"
                type="text"
                defaultValue={loaderData.schema.roles.join(", ")}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="ability_types" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ability Types (comma-separated)</label>
              <input
                id="ability_types"
                name="ability_types"
                type="text"
                defaultValue={loaderData.schema.ability_types.join(", ")}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Stat Fields</h3>
              <div className="space-y-2">
                {Object.entries(loaderData.schema.stat_fields).map(([key, field]) => (
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

            {validationErrors && (
              <div className="text-sm text-red-500">
                {Object.entries(validationErrors).map(([key, msgs]) => (
                  <p key={key}>{key}: {msgs.join(", ")}</p>
                ))}
              </div>
            )}

            <Button type="submit">Preview Changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
