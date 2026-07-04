import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ItemSchema, type Item } from "~/schemas/item";
import { getFile, updateFile, deleteFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

export default function EditItem() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
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
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          </div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="flex gap-2 mt-8">
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-32"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  if (itemResult.error || heroesResult.error || modesResult.error) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Failed to load data</h3>
        <p>{String(itemResult.error || heroesResult.error || modesResult.error)}</p>
      </div>
    );
  }

  if (!itemResult.data) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg">Item not found</h3>
      </div>
    );
  }

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
      if (raw.effects_raw as string) {
        try {
          effects = JSON.parse(raw.effects_raw as string);
        } catch {
          setError("Invalid JSON syntax in Effects field.");
          toastError("Invalid JSON syntax in Effects field.");
          setSubmitting(false);
          return;
        }
      }

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
        toastError("Validation failed. Check your inputs.");
        return;
      }

      const heroSet = new Set(heroIds);
      const modeSet = new Set(modeIds);

      if (parsed.data.hero && !heroSet.has(parsed.data.hero)) {
        const msg = `Unknown hero "${parsed.data.hero}"`;
        setError(msg);
        toastError(msg);
        return;
      }
      if (parsed.data.mode && !modeSet.has(parsed.data.mode)) {
        const msg = `Unknown mode "${parsed.data.mode}"`;
        setError(msg);
        toastError(msg);
        return;
      }

      if (!parsed.data.hero) {
        for (const effect of parsed.data.effects) {
          if (effect.ability_id) {
            const msg = 'Universal items (no hero) cannot reference a hero-specific ability. Remove "ability_id" from effects or associate this item with a hero.';
            setError(msg);
            toastError(msg);
            return;
          }
        }
      } else {
        const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${game}/heroes/${parsed.data.hero}.json`);
        const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
        for (const effect of parsed.data.effects) {
          if (!abilityIds.has(effect.ability_id)) {
            const msg = `Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`;
            setError(msg);
            toastError(msg);
            return;
          }
        }
      }

      try {
        await updateFile(`data/${game}/items/${id}.json`, parsed.data, sha, `Update item: ${parsed.data.name}`);
        toastSuccess(`Item ${parsed.data.name} updated successfully!`);
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/items`);
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
    if (!confirm("Are you sure you want to delete this item? This action cannot be undone.")) return;
    setSubmitting(true);
    setError(null);
    try {
      try {
        await deleteFile(`data/${game}/items/${id}.json`, sha, `Delete item: ${id}`);
        toastSuccess("Item deleted successfully.");
      } catch (err) {
        if (isConflictError(err)) {
          setError("Conflict detected. Please try again.");
          toastError("Conflict detected! Someone else modified this file.");
          return;
        }
        throw err;
      }
      navigate(`/${game}/items`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">Edit Item: {item.name}</h1>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50 mb-4">{error}</p>}
          <form onSubmit={handleUpdate} className="space-y-5">
            <FormField name="name" label="Name" defaultValue={item.name} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero" defaultValue={item.hero ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {heroIds.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode" defaultValue={item.mode ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {modeIds.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <FormField name="description" label="Description" defaultValue={item.description ?? ""} required={false} />

            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effects (JSON array)</label>
              <textarea
                name="effects_raw"
                rows={8}
                defaultValue={JSON.stringify(item.effects, null, 2)}
                className="block w-full rounded-xl border border-gray-300/50 bg-white/50 px-4 py-3 text-sm font-mono shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600/50 dark:bg-gray-900/50 dark:text-gray-100 transition-colors"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20 w-1/2 sm:w-auto">
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate(`/${game}/items`)} className="w-1/2 sm:w-auto bg-gray-100 dark:bg-gray-800">
                Cancel
              </Button>
            </div>
          </form>

          <form onSubmit={handleDelete} className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-800/50">
            <Button type="submit" variant="destructive" disabled={submitting} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20">
              Delete Item
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
