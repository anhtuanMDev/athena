import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ItemSchema } from "~/schemas/item";
import { getFile, createFile, listDirectory } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

export default function NewItem() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const { data, loading, error } = useData(async () => {
    const heroIds = await listDirectory(game!, "heroes");
    const modeIds = await listDirectory(game!, "modes");
    return { heroes: heroIds, modes: modeIds, game: game! };
  }, [game]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    const raw = Object.fromEntries(formData);

    let effects: Array<{ ability_id: string }> = [];
    try {
      effects = (raw.effects_raw as string) ? JSON.parse(raw.effects_raw as string) : [];
    } catch { /* ignore */ }

    try {
      const parsed = ItemSchema.safeParse({
        id: raw.id,
        game,
        name: raw.name,
        description: raw.description || undefined,
        hero: (raw.hero as string) || undefined,
        mode: (raw.mode as string) || undefined,
        effects,
      });

      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      const heroIds = new Set(await listDirectory(game!, "heroes"));
      const modeIds = new Set(await listDirectory(game!, "modes"));

      if (parsed.data.hero && !heroIds.has(parsed.data.hero)) {
        setErrors({ _form: [`Unknown hero "${parsed.data.hero}"`] });
        return;
      }
      if (parsed.data.mode && !modeIds.has(parsed.data.mode)) {
        setErrors({ _form: [`Unknown mode "${parsed.data.mode}"`] });
        return;
      }

      if (!parsed.data.hero) {
        for (const effect of parsed.data.effects) {
          if (effect.ability_id) {
            setErrors({ _form: [`Universal items (no hero) cannot reference a hero-specific ability. Remove "ability_id" from effects or associate this item with a hero.`] });
            return;
          }
        }
      } else {
        const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${game!}/heroes/${parsed.data.hero}.json`);
        const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
        for (const effect of parsed.data.effects) {
          if (!abilityIds.has(effect.ability_id)) {
            setErrors({ _form: [`Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`] });
            return;
          }
        }
      }

      const exists = await getFile(`data/${game!}/items/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["An item with this ID already exists"] });
        return;
      }

      await createFile(`data/${game!}/items/${parsed.data.id}.json`, parsed.data, `Add item: ${parsed.data.name}`);
      navigate(`/${game!}/items`);
    } catch (err) {
      setErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Item — {data.game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField name="id" label="Item ID (kebab-case)" />
            <FormField name="name" label="Name" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {data.heroes.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {data.modes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <FormField name="description" label="Description" required={false} />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effects (JSON array)</label>
              <textarea
                name="effects_raw"
                rows={8}
                defaultValue={JSON.stringify([{ ability_id: "", override_name: "", override_type: "", override_description: "", params_override: {} }], null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500">Each effect can override name, type, description, and params for an ability</p>
            </div>

            <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Item"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
