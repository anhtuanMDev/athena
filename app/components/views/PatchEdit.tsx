import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PatchSchema, type Patch } from "~/schemas/patch";
import { getFile, updateFile, deleteFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

export default function EditPatch() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Patch; sha: string } | null>(
    () => getFile<Patch>(`data/${game}/patches/${id}.json`),
    [game, id], "PatchEdit-20"
  );

  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result.loading) {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-48 bg-border rounded-lg"></div>
        <div className="space-y-4 bg-surface p-6 rounded-xl border border-border">
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-12 bg-border rounded-lg"></div>
          <div className="h-32 bg-border rounded-lg"></div>
          <div className="h-10 bg-border rounded-lg w-32 mt-8"></div>
        </div>
      </div>
    );
  }

  if (result.error) return (
    <LoadErrorState
      title="Failed to Load Patch"
      error={result.error}
      onBack={() => window.history.back()}
    />
  );

  if (!result.data) return (
    <div className="w-full py-12">
      <EmptyState
        title="Patch Not Found"
        description="The patch you are trying to edit could not be found or has been deleted."
        action={<Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>}
      />
    </div>
  );

  const p = result.data.content;
  const sha = result.data.sha;

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    try {
      const changesRaw = formData.get("_changes") as string;
      let changes: Array<{ hero: string; field: string; from?: string; to?: string; note?: string }> = [];
      if (changesRaw) {
        try {
          changes = JSON.parse(changesRaw);
        } catch {
          setError("Invalid JSON syntax in Changes field.");
          toastError("Invalid JSON syntax in Changes field.");
          setSubmitting(false);
          return;
        }
      }

      const parsed = PatchSchema.safeParse({
        patch: id,
        date: formData.get("date"),
        summary: formData.get("summary") || undefined,
        changes,
      });
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
        setErrors(fieldErrors);
        const msgs = Object.values(fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        toastError("Validation failed. Check your inputs.");
        return;
      }
      try {
        await updateFile(`data/${game}/patches/${id}.json`, parsed.data, sha, `Update patch: ${parsed.data.patch}`);
        toastSuccess(`Patch ${parsed.data.patch} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setError(err.message);
          toastError(err.message);
          return;
        }
        throw err;
      }
      navigate(`/${game}/patches`);
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
    if (!confirm("Are you sure you want to delete this patch? This action cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await deleteFile(`data/${game}/patches/${id}.json`, sha, `Delete patch: ${id}`);
        toastSuccess("Patch deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setError(err.message);
          toastError(err.message);
          return;
        }
        throw err;
      }
      navigate(`/${game}/patches`);
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
          <h1 className="text-2xl font-bold text-ink capitalize tracking-tight">Edit Patch: {p.patch}</h1>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-5">
            {/* Top Actions */}
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <Button type="button" variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-muted">Patch ID</label>
              <p className="mt-1 text-sm font-bold text-ink">{p.patch}</p>
            </div>
            <FormField name="date" label="Date" defaultValue={p.date} type="date" error={!!errors?.date} helperText={errors?.date?.[0]} />
            <FormField name="summary" label="Summary" defaultValue={p.summary ?? ""} required={false} error={!!errors?.summary} helperText={errors?.summary?.[0]} />
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-ink uppercase tracking-wider">Changes (JSON array)</label>
              <textarea aria-label="Changes (JSON array)"
                name="_changes"
                rows={8}
                defaultValue={JSON.stringify(p.changes, null, 2)}
                className="block w-full rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm font-mono shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:text-gray-100 transition-colors"
              />
            </div>
            
            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg w-full sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>

          <form onSubmit={handleDelete} className="mt-8 pt-6 border-t border-border">
            <Button type="submit" variant="destructive" disabled={submitting} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 shadow-lg">
              Delete Patch
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
