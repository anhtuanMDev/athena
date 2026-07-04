import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { MapSchema, type Map } from "~/schemas/map";
import { getFile, updateFile, deleteFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

export default function EditMap() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Map; sha: string } | null>(
    () => getFile<Map>(`data/${game}/maps/${id}.json`),
    [game, id]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result.loading) {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 mt-8"></div>
        </div>
      </div>
    );
  }

  if (result.error) return (
    <div className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load map</h3>
      <p>{String(result.error)}</p>
    </div>
  );

  if (!result.data) return (
    <div className="max-w-lg mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg">Map not found</h3>
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
      const parsed = MapSchema.safeParse({
        ...raw,
        game,
        game_modes: (raw.game_modes as string || "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (!parsed.success) {
        const msgs = Object.values(parsed.error.flatten().fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        toastError("Validation failed. Check your inputs.");
        return;
      }
      try {
        await updateFile(`data/${game}/maps/${id}.json`, parsed.data, sha, `Update map: ${parsed.data.name}`);
        toastSuccess(`Map ${parsed.data.name} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to save: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("Are you sure you want to delete this map? This action cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await deleteFile(`data/${game}/maps/${id}.json`, sha, `Delete map: ${id}`);
        toastSuccess("Map deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">Edit Map: {m.name}</h1>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-5">
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="game_modes" label="Game Modes (comma-separated)" defaultValue={m.game_modes?.join(", ") ?? ""} required={false} />
            <FormField name="location" label="Location" defaultValue={m.location ?? ""} required={false} />
            
            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20 w-full sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>

          <form onSubmit={handleDelete} className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
            <input type="hidden" name="sha" value={sha} />
            <Button type="submit" variant="destructive" disabled={submitting} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20">
              Delete Map
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
