import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ModeSchema, type Mode } from "~/schemas/mode";
import { getFile, updateFile, deleteFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

interface DeleteConfirm {
  mode: string;
  referencingItems: string[];
  referencingHeroes: string[];
}

export default function EditMode() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Mode; sha: string } | null>(
    () => getFile<Mode>(`data/${game}/modes/${id}.json`),
    [game, id]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

  if (result.loading) return <div className="text-gray-500 p-4">Loading...</div>;
  if (result.error) return <div className="text-red-500 p-4">Error: {String(result.error)}</div>;
  if (!result.data) return <div className="text-red-500 p-4">Mode not found</div>;

  const m = result.data.content;
  const sha = result.data.sha;

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const raw = Object.fromEntries(formData);
      const parsed = ModeSchema.safeParse(raw);
      if (!parsed.success) {
        const msgs = Object.values(parsed.error.flatten().fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        return;
      }
      const current = await getFile(`data/${game}/modes/${id}.json`);
      if (!current) {
        setError("Mode not found");
        return;
      }
      try {
        await updateFile(`data/${game}/modes/${id}.json`, parsed.data, current.sha, `Update mode: ${parsed.data.name}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/modes`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteCheck(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const itemIds = await listDirectory(game!, "items");
      const referencingItems: string[] = [];
      for (const itemId of itemIds) {
        const itemFile = await getFile<{ mode?: string }>(`data/${game}/items/${itemId}.json`);
        if (itemFile?.content.mode === id) referencingItems.push(itemId);
      }

      const heroIds = await listDirectory(game!, "heroes");
      const referencingHeroes: string[] = [];
      for (const heroId of heroIds) {
        const heroFile = await getFile<{ kit: Array<{ mode_overrides?: Record<string, unknown> }> }>(`data/${game}/heroes/${heroId}.json`);
        if (heroFile?.content.kit?.some((a) => a.mode_overrides && id! in a.mode_overrides)) {
          referencingHeroes.push(heroId);
        }
      }

      setDeleteConfirm({ mode: id!, referencingItems, referencingHeroes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const current = await getFile(`data/${game}/modes/${id}.json`);
      if (!current) {
        setError("Mode not found");
        return;
      }
      try {
        await deleteFile(`data/${game}/modes/${id}.json`, current.sha, `Delete mode: ${id}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/modes`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (deleteConfirm) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader><h1 className="text-xl font-bold text-red-600">Delete Mode: {m.name}?</h1></CardHeader>
          <CardContent className="space-y-4">
            {deleteConfirm.referencingItems.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p className="font-medium text-yellow-800">This mode is referenced by {deleteConfirm.referencingItems.length} item(s):</p>
                <p className="text-yellow-700">{deleteConfirm.referencingItems.join(", ")}</p>
                <p className="text-yellow-700 mt-1">These references will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingHeroes.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p className="font-medium text-yellow-800">This mode has mode_overrides in {deleteConfirm.referencingHeroes.length} hero(es):</p>
                <p className="text-yellow-700">{deleteConfirm.referencingHeroes.join(", ")}</p>
                <p className="text-yellow-700 mt-1">These overrides will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingItems.length === 0 && deleteConfirm.referencingHeroes.length === 0 && (
              <p className="text-sm text-gray-600">No other entities reference this mode.</p>
            )}
            <div className="flex gap-2">
              <form onSubmit={handleDeleteConfirm}>
                <Button type="submit" variant="destructive" disabled={submitting}>
                  {submitting ? "Deleting..." : "Delete Anyway"}
                </Button>
              </form>
              <Button type="button" variant="secondary" onClick={() => { setDeleteConfirm(null); setError(null); }}>
                Cancel
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Mode: {m.name}</h1></CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-4">
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="description" label="Description" defaultValue={m.description ?? ""} required={false} />
            <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </form>
          <form onSubmit={handleDeleteCheck} className="mt-6 pt-4 border-t">
            <Button type="submit" variant="destructive" disabled={submitting}>Delete Mode</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
