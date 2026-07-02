import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.items.new";
import { ItemSchema } from "~/schemas/item";
import { getFile, createFile, listDirectory } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const heroIds = await listDirectory(params.game, "heroes");
  const modeIds = await listDirectory(params.game, "modes");
  return { heroes: heroIds, modes: modeIds, game: params.game };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);

  let effects: Array<{ ability_id: string }> = [];
  try {
    effects = (raw.effects_raw as string) ? JSON.parse(raw.effects_raw as string) : [];
  } catch { /* ignore */ }

  const parsed = ItemSchema.safeParse({
    id: raw.id,
    game: params.game,
    name: raw.name,
    description: raw.description || undefined,
    hero: (raw.hero as string) || undefined,
    mode: (raw.mode as string) || undefined,
    effects,
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: raw }, { status: 400 });
  }

  const heroIds = new Set(await listDirectory(params.game, "heroes"));
  const modeIds = new Set(await listDirectory(params.game, "modes"));

  if (parsed.data.hero && !heroIds.has(parsed.data.hero)) {
    return data({ errors: { _form: [`Unknown hero "${parsed.data.hero}"`] }, values: raw }, { status: 400 });
  }
  if (parsed.data.mode && !modeIds.has(parsed.data.mode)) {
    return data({ errors: { _form: [`Unknown mode "${parsed.data.mode}"`] }, values: raw }, { status: 400 });
  }

  if (parsed.data.hero) {
    const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${params.game}/heroes/${parsed.data.hero}.json`);
    const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
    for (const effect of parsed.data.effects) {
      if (!abilityIds.has(effect.ability_id)) {
        return data({ errors: { _form: [`Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`] }, values: raw }, { status: 400 });
      }
    }
  }

  const exists = await getFile(`data/${params.game}/items/${parsed.data.id}.json`);
  if (exists) return data({ errors: { id: ["An item with this ID already exists"] }, values: raw }, { status: 400 });

  await createFile(`data/${params.game}/items/${parsed.data.id}.json`, parsed.data, `Add item: ${parsed.data.name}`);
  throw redirect(`/${params.game}/items`);
}

export default function NewItem({ loaderData }: Route.ComponentProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Item — {loaderData.game}</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <FormField name="id" label="Item ID (kebab-case)" />
            <FormField name="name" label="Name" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {loaderData.heroes.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {loaderData.modes.map(m => <option key={m} value={m}>{m}</option>)}
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

            <Button type="submit">Create Item</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, required = true }: { name: string; label: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input id={name} name={name} type="text" required={required}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
