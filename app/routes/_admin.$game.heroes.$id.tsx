import { useState } from "react";
import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes.$id";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, updateFile } from "~/lib/github.server";
import type { SchemaFile } from "~/schemas/schema-file";
import { computeDiff } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { buildHeroFromFormData, coerceKitParams } from "~/lib/parse-kit";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);

  const file = await getFile<Hero>(`data/${params.game}/heroes/${params.id}.json`);
  if (!file) throw data("Hero not found", { status: 404 });
  const schemaFile = await getFile<{ roles: string[]; ability_types: string[] }>(`data/${params.game}/schema.json`);
  return { hero: file.content, sha: file.sha, game: params.game, roles: schemaFile?.content.roles ?? [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const raw = Object.fromEntries(formData);

  if (intent === "commit") {
    const json = formData.get("_heroJson") as string;
    let heroData: unknown;
    try { heroData = JSON.parse(json); } catch {
      return data({ errors: { _form: ["Invalid hero data in commit"] } as const }, { status: 400 });
    }
    const parsed = HeroSchema.safeParse(heroData);
    if (!parsed.success) {
      return data({ errors: { _form: ["Hero data failed validation on commit"] } as const }, { status: 400 });
    }
    const current = await getFile<Hero>(`data/${params.game}/heroes/${params.id}.json`);
    if (!current) return data({ errors: { _form: ["Hero file not found on GitHub"] } as const }, { status: 500 });
    await updateFile(`data/${params.game}/heroes/${params.id}.json`, parsed.data, current.sha, `Update hero: ${parsed.data.name}`);
    return data({ success: true as const });
  }

  const hero = buildHeroFromFormData(formData, params.game, params.id);

  const schemaFile = await getFile<SchemaFile>(`data/${params.game}/schema.json`);
  if (schemaFile) {
    const rawKit = hero.kit;
    if (Array.isArray(rawKit)) {
      hero.kit = coerceKitParams(rawKit as Hero["kit"], schemaFile.content.stat_fields);
    }
  }


  const parsed = HeroSchema.safeParse(hero);
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: raw, intent: "validate" as const }, { status: 400 });
  }

  const current = await getFile<Hero>(`data/${params.game}/heroes/${params.id}.json`);
  if (!current) return data({ errors: { _form: ["Hero file not found on GitHub"] } as const }, { status: 500 });

  const diffs = computeDiff(current.content, parsed.data);
  return data({ diffs, heroJson: JSON.stringify(parsed.data), sha: current.sha, intent: "preview" as const });
}

export default function EditHero({ loaderData, actionData }: Route.ComponentProps) {
  const { hero, roles } = loaderData;

  const previewData = actionData && "diffs" in actionData ? actionData as { diffs: import("~/lib/diff").DiffEntry[]; heroJson: string; sha: string; intent: string } : null;

  if (previewData?.diffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Review Changes</h1>
        <DiffView diffs={previewData.diffs} />
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="commit" />
          <input type="hidden" name="_heroJson" value={previewData.heroJson} />
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
          <HeroForm hero={hero} roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({ hero, roles }: { hero: Hero; roles: string[] }) {
  const [abilities, setAbilities] = useState(hero.kit);

  function addAbility() {
    setAbilities([...abilities, { id: "", name: "", type: "", description: "", params: {} }]);
  }

  function removeAbility(i: number) {
    setAbilities(abilities.filter((_, idx) => idx !== i));
  }

  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value="validate" />
      <input type="hidden" name="_kitCount" value={String(abilities.length)} />

      <div className="grid grid-cols-2 gap-4">
        <FormField name="name" label="Name" defaultValue={hero.name} />
        <FormField name="portrait" label="Portrait URL" defaultValue={hero.portrait} />
      </div>

      <FormField name="roles" label={`Roles (${roles.join(", ")})`} defaultValue={hero.roles.join(", ")} />
      <div className="grid grid-cols-2 gap-4">
        <FormField name="difficulty" label="Difficulty (1-5)" type="number" defaultValue={String(hero.difficulty ?? "")} required={false} />
        <FormField name="health" label="Health (JSON)" defaultValue={hero.health ? JSON.stringify(hero.health) : ""} required={false} />
      </div>
      <FormField name="bio" label="Bio" defaultValue={hero.bio ?? ""} required={false} />
      <FormField name="tags" label="Tags (comma-separated)" defaultValue={hero.tags?.join(", ") ?? ""} required={false} />

      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
        <div className="space-y-3">
          {abilities.map((ability, i) => (
            <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Ability {i + 1}</span>
                <button type="button" onClick={() => removeAbility(i)}
                  className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input type="hidden" name={`_kit_${i}_params_keys`} value={Object.keys(ability.params).join(",")} />
              {ability.mode_overrides ? <input type="hidden" name={`_kit_${i}_mode_overrides`} value={JSON.stringify(ability.mode_overrides)} /> : null}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input name={`kit_${i}_id`} defaultValue={ability.id} placeholder="id"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_name`} defaultValue={ability.name} placeholder="name"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_type`} defaultValue={ability.type} placeholder="type"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <input name={`kit_${i}_description`} defaultValue={ability.description ?? ""} placeholder="description"
                className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
              {Object.entries(ability.params).map(([key, val]) => (
                <div key={key} className="mt-1">
                  <label className="text-xs text-gray-500">{key}</label>
                  <input name={`kit_${i}_params_${key}`} defaultValue={String(val ?? "")}
                    className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <button type="button" onClick={addAbility}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">
          + Add Ability
        </button>
      </div>

      <Button type="submit">Preview Changes</Button>
    </Form>
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
