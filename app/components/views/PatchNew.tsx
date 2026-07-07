import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PatchSchema } from "~/schemas/patch";
import { getFile, createFile, listDirectory } from "~/lib/github";
import {
  type DynamicSchemaFile,
  type DynamicField,
} from "~/schemas/dynamic-schema";
import { useData } from "~/lib/use-data";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";

export default function NewPatch() {
  const { game } = useParams();
  assertSafeGameSlug(game!);

  const { data, loading, error } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(
      game!,
      "schemas",
      true,
    );
    const patchSchemas = schemas.filter((s) => s && s.category === "patch");
    const allFields: DynamicField[] = [];
    for (const s of patchSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, schemaCount: patchSchemas.length, game: game! };
  }, [game], "PatchNew-20");
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    const changesRaw = formData.get("_changes") as string;
    let changes: Array<{
      hero: string;
      field: string;
      from?: string;
      to?: string;
      note?: string;
    }> = [];
    if (changesRaw) {
      try {
        changes = JSON.parse(changesRaw);
      } catch {
        setErrors({ _form: ["Invalid JSON syntax in Changes field."] });
        toastError("Invalid JSON syntax in Changes field.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const parsed = PatchSchema.safeParse({
        patch: formData.get("patch"),
        date: formData.get("date"),
        summary: formData.get("summary") || undefined,
        changes,
      });

      if (!parsed.success) {
        setErrors(
          parsed.error.flatten().fieldErrors as Record<string, string[]>,
        );
        toastError("Validation failed. Check your inputs.");
        return;
      }

      const exists = await getFile(
        `data/${game}/patches/${parsed.data.patch}.json`,
      );
      if (exists) {
        setErrors({ patch: ["A patch with this ID already exists"] });
        toastError("A patch with this ID already exists.");
        return;
      }

      await createFile(
        `data/${game}/patches/${parsed.data.patch}.json`,
        parsed.data,
        `Add patch: ${parsed.data.patch}`,
      );
      toastSuccess(`Patch ${parsed.data.patch} created successfully!`);
      navigate(`/${game}/patches`);
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create patch: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error)
    return (
      <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
        <p>{String(error)}</p>
      </div>
    );

  if (!data) return null;

  if (data.schemaCount === 0) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No Schema Configured
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              You must create a schema for Patches before adding entries.
            </p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>
              Create Schema
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
            New Patch - {game}
          </h1>
        </CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">
              {errors._form.join(", ")}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField
              name="patch"
              label="Patch ID (e.g. 2026.07)"
              placeholder="2026.07"
            />
            {data.fields.map((f) => {
              if (["patch", "changes"].includes(f.key)) return null;
              if (f.type === "enum" || f.type === "list") {
                return (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mb-1">
                      {f.label}
                    </label>
                    {f.type === "enum" ? (
                      <select
                        name={f.key}
                        required={f.required}
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      >
                        <option value="">- Select {f.label} -</option>
                        {f.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name={f.key}
                        placeholder={`${f.label} (comma-separated)`}
                        required={f.required}
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    )}
                  </div>
                );
              }
              // For dates or numbers
              let type = "text";
              if (f.type === "number") type = "number";
              if (f.key.includes("date")) type = "date";
              return (
                <FormField
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  required={f.required}
                  type={type}
                />
              );
            })}
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Changes (JSON array)
              </label>
              <textarea
                name="_changes"
                rows={5}
                defaultValue={JSON.stringify(
                  [{ hero: "", field: "", from: "", to: "", note: "" }],
                  null,
                  2,
                )}
                className="block w-full rounded-xl border border-gray-300/50 bg-white/50 px-4 py-3 text-sm font-mono shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600/50 dark:bg-gray-900/50 dark:text-gray-100 transition-colors"
              />
            </div>

            <div className="pt-4 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/${game}/patchs`)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="shadow-lg shadow-orange-500/20"
              >
                {submitting ? "Creating..." : "Create Patch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
