import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.items.$id";
import { ItemSchema, type Item } from "~/schemas/item";
import { getFile, updateFile, deleteFile, listDirectory } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const file = await getFile<Item>(`data/${params.game}/items/${params.id}.json`);
  if (!file) throw data("Item not found", { status: 404 });
  const heroIds = await listDirectory(params.game, "heroes");
  const modeIds = await listDirectory(params.game, "modes");
  return { item: file.content, sha: file.sha, heroes: heroIds, modes: modeIds };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const sha = formData.get("sha") as string;
    await deleteFile(`data/${params.game}/items/${params.id}.json`, sha, `Delete item: ${params.id}`);
    throw redirect(`/${params.game}/items`);
  }

  const raw = Object.fromEntries(formData);

  let effects: Array<{ ability_id: string }> = [];
  try {
    effects = (raw.effects_raw as string) ? JSON.parse(raw.effects_raw as string) : [];
  } catch { /* ignore */ }

  const parsed = ItemSchema.safeParse({
    id: params.id,
    game: params.game,
    name: raw.name,
    description: raw.description || undefined,
    hero: (raw.hero as string) || undefined,
    mode: (raw.mode as string) || undefined,
    effects,
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const heroIds = new Set(await listDirectory(params.game, "heroes"));
  const modeIds = new Set(await listDirectory(params.game, "modes"));

  if (parsed.data.hero && !heroIds.has(parsed.data.hero)) {
    return data({ errors: { _form: [`Unknown hero "${parsed.data.hero}"`] } }, { status: 400 });
  }
  if (parsed.data.mode && !modeIds.has(parsed.data.mode)) {
    return data({ errors: { _form: [`Unknown mode "${parsed.data.mode}"`] } }, { status: 400 });
  }

  if (parsed.data.hero) {
    const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${params.game}/heroes/${parsed.data.hero}.json`);
    const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
    for (const effect of parsed.data.effects) {
      if (!abilityIds.has(effect.ability_id)) {
        return data({ errors: { _form: [`Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`] } }, { status: 400 });
      }
    }
  }

  const current = await getFile(`data/${params.game}/items/${params.id}.json`);
  if (!current) throw data("Item not found", { status: 404 });
  await updateFile(`data/${params.game}/items/${params.id}.json`, parsed.data, current.sha, `Update item: ${parsed.data.name}`);
  throw redirect(`/${params.game}/items`);
}

export default function EditItem({ loaderData }: Route.ComponentProps) {
  const item = loaderData.item;
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Item: {item.name}</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update" />
            <FormField name="name" label="Name" defaultValue={item.name} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero" defaultValue={item.hero ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {loaderData.heroes.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode" defaultValue={item.mode ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {loaderData.modes.map(m => <option key={m} value={m}>{m}</option>)}
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
              <Button type="submit">Save</Button>
              <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
            </div>
          </Form>

          <Form method="post" className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700" onSubmit={(e) => { if (!confirm("Delete this item?")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="sha" value={loaderData.sha} />
            <Button type="submit" variant="danger">Delete Item</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, defaultValue, required = true }: { name: string; label: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input id={name} name={name} type="text" required={required} defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
