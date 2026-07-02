import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes.new";
import { HeroSchema } from "~/schemas/hero";
import { getFile, createFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { buildHeroFromFormData } from "~/lib/parse-kit";

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
  const parsed = HeroSchema.safeParse(hero);
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: raw }, { status: 400 });
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
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_kitCount" value="0" id="kitCount" />

            <div className="grid grid-cols-2 gap-4">
              <FormField name="id" label="Hero ID" placeholder="e.g. tracer" />
              <FormField name="name" label="Name" placeholder="e.g. Tracer" />
            </div>

            <FormField name="roles" label={`Roles (${loaderData.roles.join(", ")})`} placeholder="e.g. damage" />
            <FormField name="portrait" label="Portrait URL" placeholder="https://..." />
            <div className="grid grid-cols-2 gap-4">
              <FormField name="difficulty" label="Difficulty (1-5)" type="number" required={false} />
              <FormField name="health" label="Health" type="number" required={false} />
            </div>
            <FormField name="bio" label="Bio (optional)" required={false} />
            <FormField name="tags" label="Tags (comma-separated, optional)" required={false} />

            <div id="kitSection">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
              <p className="text-xs text-gray-500 mb-2">Kit editor supports adding abilities. For v1, add abilities by editing the JSON directly.</p>
            </div>

            <Button type="submit">Create Hero</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
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
