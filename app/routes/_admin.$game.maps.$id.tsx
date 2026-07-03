import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { MapSchema, type Map } from "~/schemas/map";
import { getFile, updateFile, deleteFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

export default function EditMap() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const result = useData<{ content: Map; sha: string } | null>(
    () => getFile<Map>(`data/${game}/maps/${id}.json`),
    [game, id]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (result.loading) return <div className="text-gray-500 p-4">Loading...</div>;
  if (result.error) return <div className="text-red-500 p-4">Error: {String(result.error)}</div>;
  if (!result.data) return <div className="text-red-500 p-4">Map not found</div>;

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
        return;
      }
      const current = await getFile(`data/${game}/maps/${id}.json`);
      if (!current) {
        setError("Map not found");
        return;
      }
      try {
        await updateFile(`data/${game}/maps/${id}.json`, parsed.data, current.sha, `Update map: ${parsed.data.name}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("Delete this map?")) return;
    setSubmitting(true);
    setError(null);
    try {
      const current = await getFile(`data/${game}/maps/${id}.json`);
      if (!current) { setError("Map not found"); setSubmitting(false); return; }
      try {
        await deleteFile(`data/${game}/maps/${id}.json`, current.sha, `Delete map: ${id}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/maps`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Map: {m.name}</h1></CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-4">
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="game_modes" label="Game Modes (comma-separated)" defaultValue={m.game_modes?.join(", ") ?? ""} required={false} />
            <FormField name="location" label="Location" defaultValue={m.location ?? ""} required={false} />
            <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </form>
          <form onSubmit={handleDelete} className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <input type="hidden" name="sha" value={sha} />
            <Button type="submit" variant="destructive" disabled={submitting}>Delete Map</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
