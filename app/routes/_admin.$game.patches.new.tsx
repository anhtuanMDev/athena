import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PatchSchema } from "~/schemas/patch";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";

export default function NewPatch() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    const changesRaw = formData.get("_changes") as string;
    let changes: Array<{ hero: string; field: string; from?: string; to?: string; note?: string }> = [];
    try {
      changes = changesRaw ? JSON.parse(changesRaw) : [];
    } catch { /* ignore */ }

    try {
      const parsed = PatchSchema.safeParse({
        patch: formData.get("patch"),
        date: formData.get("date"),
        summary: formData.get("summary") || undefined,
        changes,
      });

      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      const exists = await getFile(`data/${game}/patches/${parsed.data.patch}.json`);
      if (exists) {
        setErrors({ patch: ["A patch with this ID already exists"] });
        return;
      }

      await createFile(`data/${game}/patches/${parsed.data.patch}.json`, parsed.data, `Add patch: ${parsed.data.patch}`);
      navigate(`/${game}/patches`);
    } catch (err) {
      setErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Patch</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField name="patch" label="Patch ID (e.g. 2026.07)" />
            <FormField name="date" label="Date (ISO)" type="date" />
            <FormField name="summary" label="Summary" required={false} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Changes (JSON array)</label>
              <textarea
                name="_changes"
                rows={5}
                defaultValue={JSON.stringify([{ hero: "", field: "", from: "", to: "", note: "" }], null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Patch"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
