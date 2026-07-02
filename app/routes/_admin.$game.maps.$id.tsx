import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.maps.$id";
import { MapSchema, type Map } from "~/schemas/map";
import { getFile, updateFile, deleteFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ params }: Route.LoaderArgs) {
  const file = await getFile<Map>(`data/${params.game}/maps/${params.id}.json`);
  if (!file) throw data("Map not found", { status: 404 });
  return { map: file.content, sha: file.sha };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const sha = formData.get("sha") as string;
    await deleteFile(`data/${params.game}/maps/${params.id}.json`, sha, `Delete map: ${params.id}`);
    throw redirect(`/${params.game}/maps`);
  }

  const raw = Object.fromEntries(formData);
  const parsed = MapSchema.safeParse({
    ...raw,
    game: params.game,
    game_modes: (raw.game_modes as string || "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const current = await getFile(`data/${params.game}/maps/${params.id}.json`);
  if (!current) throw data("Map not found", { status: 404 });
  await updateFile(`data/${params.game}/maps/${params.id}.json`, parsed.data, current.sha, `Update map: ${parsed.data.name}`);
  throw redirect(`/${params.game}/maps`);
}

export default function EditMap({ loaderData }: Route.ComponentProps) {
  const m = loaderData.map;
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Map: {m.name}</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update" />
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="game_modes" label="Game Modes (comma-separated)" defaultValue={m.game_modes?.join(", ") ?? ""} required={false} />
            <FormField name="location" label="Location" defaultValue={m.location ?? ""} required={false} />
            <Button type="submit">Save</Button>
          </Form>
          <Form method="post" className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700" onSubmit={(e) => { if (!confirm("Delete this map?")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="sha" value={loaderData.sha} />
            <Button type="submit" variant="danger">Delete Map</Button>
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
