import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes.$id";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, updateFile } from "~/lib/github.server";
import { computeDiff } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ params }: Route.LoaderArgs) {
  const file = await getFile<Hero>(`data/${params.game}/heroes/${params.id}.json`);
  if (!file) throw data("Hero not found", { status: 404 });
  const schemaFile = await getFile<{ roles: string[]; ability_types: string[] }>(`data/${params.game}/schema.json`);
  return { hero: file.content, sha: file.sha, game: params.game, roles: schemaFile?.content.roles ?? [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const raw = Object.fromEntries(formData);
  const kit: Hero["kit"] = [];
  const kitCount = parseInt(raw._kitCount as string || "0");
  for (let i = 0; i < kitCount; i++) {
    const paramsEntries: Record<string, unknown> = {};
    const paramKeys = (raw[`_kit_${i}_params_keys`] as string || "").split(",").filter(Boolean);
    for (const key of paramKeys) {
      paramsEntries[key] = raw[`kit_${i}_params_${key}`] ?? "";
    }
    kit.push({
      id: raw[`kit_${i}_id`] as string,
      name: raw[`kit_${i}_name`] as string,
      type: raw[`kit_${i}_type`] as string,
      description: raw[`kit_${i}_description`] as string || undefined,
      params: paramsEntries,
    });
  }

  const hero: Record<string, unknown> = {
    id: params.id,
    game: params.game,
    name: raw.name as string,
    roles: (raw.roles as string || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    difficulty: raw.difficulty ? parseInt(raw.difficulty as string) : undefined,
    health: { health: raw.health ? parseInt(raw.health as string) : undefined },
    portrait: raw.portrait as string,
    bio: raw.bio as string || undefined,
    tags: (raw.tags as string || "").split(",").map((s: string) => s.trim()).filter(Boolean),
    kit,
  };

  const parsed = HeroSchema.safeParse(hero as unknown);
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: raw, intent: "validate" as const }, { status: 400 });
  }

  const current = await getFile<Hero>(`data/${params.game}/heroes/${params.id}.json`);
  if (!current) return data({ errors: { _form: ["Hero file not found on GitHub"] } }, { status: 500 });

  if (intent === "commit") {
    await updateFile(`data/${params.game}/heroes/${params.id}.json`, parsed.data, current.sha, `Update hero: ${parsed.data.name}`);
    return data({ success: true as const });
  }

  const diffs = computeDiff(current.content, parsed.data);
  return data({ diffs, values: raw, sha: current.sha, intent: "preview" as const });
}

export default function EditHero({ loaderData, actionData }: Route.ComponentProps) {
  const { hero, roles } = loaderData;

  const previewData = actionData && "diffs" in actionData ? actionData as { diffs: import("~/lib/diff").DiffEntry[]; values: Record<string, string>; sha: string; intent: string } : null;

  if (previewData?.diffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Changes</h1>
        <DiffView diffs={previewData.diffs} />
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="commit" />
          <input type="hidden" name="_kitCount" value={String(hero.kit.length)} />
          {hero.kit.map((ability, i) => (
            <input key={i} type="hidden" name={`_kit_${i}_params_keys`} value={Object.keys(ability.params).join(",")} />
          ))}
          <Button type="submit">Confirm Commit</Button>
          <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
        </Form>
      </div>
    );
  }

  const successData = actionData && "success" in actionData ? actionData as { success: boolean } : null;

  if (successData?.success) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hero Updated</h1>
        <p className="text-green-600">Changes committed successfully.</p>
        <a href={`/${loaderData.game}/heroes`} className="text-blue-600 hover:underline">Back to heroes</a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit: {hero.name}</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="validate" />
            <input type="hidden" name="_kitCount" value={String(hero.kit.length)} />

            <div className="grid grid-cols-2 gap-4">
              <FormField name="name" label="Name" defaultValue={hero.name} />
              <FormField name="portrait" label="Portrait URL" defaultValue={hero.portrait} />
            </div>

            <FormField name="roles" label={`Roles (${roles.join(", ")})`} defaultValue={hero.roles.join(", ")} />
            <div className="grid grid-cols-2 gap-4">
              <FormField name="difficulty" label="Difficulty (1-5)" type="number" defaultValue={String(hero.difficulty ?? "")} required={false} />
              <FormField name="health" label="Health" type="number" defaultValue={String(hero.health?.health ?? "")} required={false} />
            </div>
            <FormField name="bio" label="Bio" defaultValue={hero.bio ?? ""} required={false} />
            <FormField name="tags" label="Tags (comma-separated)" defaultValue={hero.tags?.join(", ") ?? ""} required={false} />

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
              {hero.kit.map((ability, i) => (
                <div key={ability.id} className="mb-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md">
                  <input type="hidden" name={`kit_${i}_id`} value={ability.id} />
                  <input type="hidden" name={`_kit_${i}_params_keys`} value={Object.keys(ability.params).join(",")} />
                  <p className="text-sm font-medium">{ability.name} (<code className="text-xs">{ability.type}</code>)</p>
                  {Object.entries(ability.params).map(([key, val]) => (
                    <div key={key} className="mt-2">
                      <label className="text-xs text-gray-500">{key}</label>
                      <input name={`kit_${i}_params_${key}`} defaultValue={String(val ?? "")} className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <Button type="submit">Preview Changes</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, defaultValue, type = "text", required = true }: { name: string; label: string; defaultValue?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
