import { useState } from "react";
import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes.new";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, createFile } from "~/lib/github.server";
import type { SchemaFile } from "~/schemas/schema-file";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { buildHeroFromFormData, coerceKitParams } from "~/lib/parse-kit";

interface AbilityForm {
  id: string; name: string; type: string; description: string;
}

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  const schemaFile = await getFile<{ roles: string[]; ability_types: string[] }>(`data/${params.game}/schema.json`);
  if (!schemaFile) throw data("Game schema not found", { status: 404 });
  return { roles: schemaFile.content.roles, abilityTypes: schemaFile.content.ability_types, game: params.game };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const id = raw.id as string;

  const hero = buildHeroFromFormData(formData, params.game, id);

  const schemaFile = await getFile<SchemaFile>(`data/${params.game}/schema.json`);
  if (schemaFile) {
    const rawKit = hero.kit;
    if (Array.isArray(rawKit)) {
      hero.kit = coerceKitParams(rawKit as Hero["kit"], schemaFile.content.stat_fields);
    }
  }

  const parsed = HeroSchema.safeParse(hero);
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: raw }, { status: 400 });
  }

  if (!parsed.data.kit.length) {
    return data({ errors: { _form: ["At least one ability is required"] } }, { status: 400 });
  }

  const exists = await getFile(`data/${params.game}/heroes/${parsed.data.id}.json`);
  if (exists) {
    return data({ errors: { id: ["A hero with this ID already exists"] }, values: raw }, { status: 400 });
  }

  await createFile(`data/${params.game}/heroes/${parsed.data.id}.json`, parsed.data, `Add hero: ${parsed.data.name}`);
  throw redirect(`/${params.game}/heroes`);
}

export default function NewHero({ loaderData }: Route.ComponentProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Hero — {loaderData.game}</h1>
        </CardHeader>
        <CardContent>
          <HeroForm roles={loaderData.roles} abilityTypes={loaderData.abilityTypes} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({ roles }: { roles: string[]; abilityTypes: string[] }) {
  const [abilities, setAbilities] = useState<AbilityForm[]>([]);

  function addAbility() {
    setAbilities([...abilities, { id: "", name: "", type: "", description: "" }]);
  }

  function removeAbility(i: number) {
    setAbilities(abilities.filter((_, idx) => idx !== i));
  }

  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="_kitCount" value={String(abilities.length)} />

      <div className="grid grid-cols-2 gap-4">
        <FormField name="id" label="Hero ID" placeholder="e.g. tracer" />
        <FormField name="name" label="Name" placeholder="e.g. Tracer" />
      </div>

      <FormField name="roles" label={`Roles (${roles.join(", ")})`} placeholder="e.g. damage" />
      <FormField name="portrait" label="Portrait URL" placeholder="https://..." />
      <div className="grid grid-cols-2 gap-4">
        <FormField name="difficulty" label="Difficulty (1-5)" type="number" required={false} />
        <FormField name="health" label="Health (JSON)" placeholder='{"health": 200}' required={false} />
      </div>
      <FormField name="bio" label="Bio (optional)" required={false} />
      <FormField name="tags" label="Tags (comma-separated, optional)" required={false} />

      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
        <div className="space-y-3">
          {abilities.map((_, i) => (
            <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Ability {i + 1}</span>
                <button type="button" onClick={() => removeAbility(i)}
                  className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input type="hidden" name={`_kit_${i}_params_keys`} value="" />
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input name={`kit_${i}_id`} placeholder="id (kebab-case)"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_name`} placeholder="name"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_type`} placeholder="type"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <input name={`kit_${i}_description`} placeholder="description (optional)"
                className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
            </div>
          ))}
        </div>
        <button type="button" onClick={addAbility}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">
          + Add Ability
        </button>
      </div>

      <Button type="submit">Create Hero</Button>
    </Form>
  );
}

function FormField({ name, label, placeholder, type = "text", required = true }: { name: string; label: string; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}
