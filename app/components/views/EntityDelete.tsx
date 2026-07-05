import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { deleteFile, getFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

export default function EntityDelete({ entityType }: { entityType: "heroes" | "maps" | "modes" | "patches" | "items" }) {
  const { game, id } = useParams();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: fileData, loading } = useData<{ sha: string } | null>(
    () => getFile<{ sha: string }>(`data/${game}/${entityType}/${id}.json`),
    [game, id, entityType]
  );

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!fileData) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteFile(`data/${game}/${entityType}/${id}.json`, fileData.sha, `Delete ${entityType} ${id}`);
      toastSuccess(`Successfully deleted ${id}`);
      navigate(`/${game}/${entityType}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error deleting file";
      setError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-12 animate-pulse">
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
      </div>
    );
  }
  
  if (!fileData) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
          Entity not found or already deleted.
        </div>
      </div>
    );
  }

  const singularEntity = entityType.endsWith("es") && entityType !== "patches" && entityType !== "heroes"
    ? entityType.slice(0, -1)
    : entityType.replace(/es$/, "").replace(/s$/, "");

  return (
    <div className="max-w-md mx-auto py-12">
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400">Confirm Deletion</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
            Are you sure you want to delete the {singularEntity} <strong>{id}</strong>? This action cannot be undone.
          </p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleDelete} className="flex gap-4">
            <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/${entityType}`)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20">
              {submitting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
