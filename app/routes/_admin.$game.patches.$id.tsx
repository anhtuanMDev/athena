import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PatchSchema, type Patch } from "~/schemas/patch";
import { getFile, updateFile, deleteFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

export default function EditPatch() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Patch; sha: string } | null>(
    () => getFile<Patch>(`data/${game}/patches/${id}.json`),
    [game, id]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result.loading) return <div className="text-gray-500 p-4">Loading...</div>;
  if (result.error) return <div className="text-red-500 p-4">Error: {String(result.error)}</div>;
  if (!result.data) return <div className="text-red-500 p-4">Patch not found</div>;

  const p = result.data.content;
  const sha = result.data.sha;

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const changesRaw = formData.get("_changes") as string;
      let changes: Array<{ hero: string; field: string; from?: string; to?: string; note?: string }> = [];
      try { changes = changesRaw ? JSON.parse(changesRaw) : []; } catch { /* ignore */ }

      const parsed = PatchSchema.safeParse({
        patch: id,
        date: formData.get("date"),
        summary: formData.get("summary") || undefined,
        changes,
      });
      if (!parsed.success) {
        const msgs = Object.values(parsed.error.flatten().fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        return;
      }
      const current = await getFile(`data/${game}/patches/${id}.json`);
      if (!current) {
        setError("Patch not found");
        return;
      }
      try {
        await updateFile(`data/${game}/patches/${id}.json`, parsed.data, current.sha, `Update patch: ${parsed.data.patch}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/patches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("Delete this patch?")) return;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await deleteFile(`data/${game}/patches/${id}.json`, sha, `Delete patch: ${id}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/patches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Patch: {p.patch}</h1></CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Patch ID</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{p.patch}</p>
            </div>
            <FormField name="date" label="Date" defaultValue={p.date} type="date" />
            <FormField name="summary" label="Summary" defaultValue={p.summary ?? ""} required={false} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Changes (JSON array)</label>
              <textarea
                name="_changes"
                rows={8}
                defaultValue={JSON.stringify(p.changes, null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </form>
          <form onSubmit={handleDelete} className="mt-6 pt-4 border-t">
            <Button type="submit" variant="destructive" disabled={submitting}>Delete Patch</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
