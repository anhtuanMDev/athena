import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.maps.new";
import { MapSchema } from "~/schemas/map";
import { getFile, createFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  const formData = Object.fromEntries(await request.formData());
  const parsed = MapSchema.safeParse({
    ...formData,
    game: params.game,
    game_modes: (formData.game_modes as string || "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }
  const exists = await getFile(`data/${params.game}/maps/${parsed.data.id}.json`);
  if (exists) return data({ errors: { id: ["A map with this ID already exists"] } }, { status: 400 });
  await createFile(`data/${params.game}/maps/${parsed.data.id}.json`, parsed.data, `Add map: ${parsed.data.name}`);
  throw redirect(`/${params.game}/maps`);
}

export default function NewMap() {
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Map</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <FormField name="id" label="Map ID (kebab-case)" />
            <FormField name="name" label="Name" />
            <FormField name="game_modes" label="Game Modes (comma-separated)" required={false} />
            <FormField name="location" label="Location" required={false} />
            <Button type="submit">Create Map</Button>
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
