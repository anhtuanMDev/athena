import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ModeSchema, type Mode } from "~/schemas/mode";
import { getFile, updateFile, deleteFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

interface DeleteConfirm {
  mode: string;
  referencingItems: string[];
  referencingHeroes: string[];
}

export default function EditMode() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Mode; sha: string } | null>(
    () => getFile<Mode>(`data/${game}/modes/${id}.json`),
    [game, id]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

  if (result.loading) {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 mt-8"></div>
        </div>
      </div>
    );
  }

  if (result.error) return (
    <div className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load mode</h3>
      <p>{String(result.error)}</p>
    </div>
  );

  if (!result.data) return (
    <div className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg">Mode not found</h3>
    </div>
  );

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
        toastError("Validation failed. Check your inputs.");
        return;
      }
      try {
        await updateFile(`data/${game}/modes/${id}.json`, parsed.data, sha, `Update mode: ${parsed.data.name}`);
        toastSuccess(`Mode ${parsed.data.name} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/modes`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to save: ${msg}`);
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
      for (let i = 0; i < itemIds.length; i += 10) {
        const batch = itemIds.slice(i, i + 10);
        await Promise.all(batch.map(async (itemId) => {
          const itemFile = await getFile<{ mode?: string }>(`data/${game}/items/${itemId}.json`);
          if (itemFile?.content.mode === id) referencingItems.push(itemId);
        }));
      }

      const heroIds = await listDirectory(game!, "heroes");
      const referencingHeroes: string[] = [];
      for (let i = 0; i < heroIds.length; i += 10) {
        const batch = heroIds.slice(i, i + 10);
        await Promise.all(batch.map(async (heroId) => {
          const heroFile = await getFile<{ kit: Array<{ mode_overrides?: Record<string, unknown> }> }>(`data/${game}/heroes/${heroId}.json`);
          if (heroFile?.content.kit?.some((a) => a.mode_overrides && id! in a.mode_overrides)) {
            referencingHeroes.push(heroId);
          }
        }));
      }

      setDeleteConfirm({ mode: id!, referencingItems, referencingHeroes });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to check references: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      try {
        await deleteFile(`data/${game}/modes/${id}.json`, sha, `Delete mode: ${id}`);
        toastSuccess("Mode deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/modes`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (deleteConfirm) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="border-red-200/50 dark:border-red-800/50 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm">
          <CardHeader>
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Delete Mode: {m.name}?</h1>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteConfirm.referencingItems.length > 0 && (
              <div className="p-4 bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm backdrop-blur-sm">
                <p className="font-bold text-yellow-800 dark:text-yellow-300">This mode is referenced by {deleteConfirm.referencingItems.length} item(s):</p>
                <p className="text-yellow-700 dark:text-yellow-400 font-mono mt-1">{deleteConfirm.referencingItems.join(", ")}</p>
                <p className="text-yellow-700 dark:text-yellow-400 mt-2 font-medium">These references will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingHeroes.length > 0 && (
              <div className="p-4 bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-sm backdrop-blur-sm">
                <p className="font-bold text-yellow-800 dark:text-yellow-300">This mode has mode_overrides in {deleteConfirm.referencingHeroes.length} hero(es):</p>
                <p className="text-yellow-700 dark:text-yellow-400 font-mono mt-1">{deleteConfirm.referencingHeroes.join(", ")}</p>
                <p className="text-yellow-700 dark:text-yellow-400 mt-2 font-medium">These overrides will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingItems.length === 0 && deleteConfirm.referencingHeroes.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 p-2">No other entities reference this mode.</p>
            )}
            <div className="flex gap-4 pt-4">
              <form onSubmit={handleDeleteConfirm} className="w-1/2">
                <Button type="submit" variant="destructive" disabled={submitting} className="w-full shadow-lg shadow-red-500/20">
                  {submitting ? "Deleting..." : "Delete Anyway"}
                </Button>
              </form>
              <Button type="button" variant="secondary" onClick={() => { setDeleteConfirm(null); setError(null); }} className="w-1/2 bg-gray-100 dark:bg-gray-800">
                Cancel
              </Button>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 p-2">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">Edit Mode: {m.name}</h1>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-5">
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="description" label="Description" defaultValue={m.description ?? ""} required={false} />
            
            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20 w-full sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>

          <form onSubmit={handleDeleteCheck} className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
            <Button type="submit" variant="destructive" disabled={submitting} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20">
              Delete Mode
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
