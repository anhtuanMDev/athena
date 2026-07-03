import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ItemSchema, type Item } from "~/schemas/item";
import { getFile, updateFile, deleteFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

export default function EditItem() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const itemResult = useData<{ content: Item; sha: string } | null>(
    () => getFile<Item>(`data/${game}/items/${id}.json`),
    [game, id]
  );
  const heroesResult = useData<string[]>(
    () => listDirectory(game!, "heroes"),
    [game]
  );
  const modesResult = useData<string[]>(
    () => listDirectory(game!, "modes"),
    [game]
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (itemResult.loading || heroesResult.loading || modesResult.loading) {
    return <div className="text-gray-500 p-4">Loading...</div>;
  }
  if (itemResult.error) return <div className="text-red-500 p-4">Error: {String(itemResult.error)}</div>;
  if (!itemResult.data) return <div className="text-red-500 p-4">Item not found</div>;

  const item = itemResult.data.content;
  const sha = itemResult.data.sha;
  const heroIds = heroesResult.data ?? [];
  const modeIds = modesResult.data ?? [];

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const raw = Object.fromEntries(formData);

      let effects: Array<{ ability_id: string }> = [];
      try {
        effects = (raw.effects_raw as string) ? JSON.parse(raw.effects_raw as string) : [];
      } catch { /* ignore */ }

      const parsed = ItemSchema.safeParse({
        id,
        game,
        name: raw.name,
        description: (raw.description as string) || undefined,
        hero: (raw.hero as string) || undefined,
        mode: (raw.mode as string) || undefined,
        effects,
      });
      if (!parsed.success) {
        const msgs = Object.values(parsed.error.flatten().fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        return;
      }

      const heroSet = new Set(heroIds);
      const modeSet = new Set(modeIds);

      if (parsed.data.hero && !heroSet.has(parsed.data.hero)) {
        setError(`Unknown hero "${parsed.data.hero}"`);
        return;
      }
      if (parsed.data.mode && !modeSet.has(parsed.data.mode)) {
        setError(`Unknown mode "${parsed.data.mode}"`);
        return;
      }

      if (!parsed.data.hero) {
        for (const effect of parsed.data.effects) {
          if (effect.ability_id) {
            setError('Universal items (no hero) cannot reference a hero-specific ability. Remove "ability_id" from effects or associate this item with a hero.');
            return;
          }
        }
      } else {
        const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${game}/heroes/${parsed.data.hero}.json`);
        const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
        for (const effect of parsed.data.effects) {
          if (!abilityIds.has(effect.ability_id)) {
            setError(`Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`);
            return;
          }
        }
      }

      const current = await getFile(`data/${game}/items/${id}.json`);
      if (!current) {
        setError("Item not found");
        return;
      }
      try {
        await updateFile(`data/${game}/items/${id}.json`, parsed.data, current.sha, `Update item: ${parsed.data.name}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/items`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm("Delete this item?")) return;
    setSubmitting(true);
    setError(null);
    try {
      const current = await getFile(`data/${game}/items/${id}.json`);
      if (!current) { setError("Item not found"); setSubmitting(false); return; }
      try {
        await deleteFile(`data/${game}/items/${id}.json`, current.sha, `Delete item: ${id}`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/items`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Item: {item.name}</h1></CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-4">
            <FormField name="name" label="Name" defaultValue={item.name} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero" defaultValue={item.hero ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {heroIds.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode" defaultValue={item.mode ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {modeIds.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <FormField name="description" label="Description" defaultValue={item.description ?? ""} required={false} />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effects (JSON array)</label>
              <textarea
                name="effects_raw"
                rows={8}
                defaultValue={JSON.stringify(item.effects, null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
              <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
            </div>
          </form>

          <form onSubmit={handleDelete} className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="submit" variant="destructive" disabled={submitting}>Delete Item</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
