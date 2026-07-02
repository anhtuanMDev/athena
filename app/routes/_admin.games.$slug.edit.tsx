import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.games.$slug.edit";
import { GameSchema } from "~/schemas/game";
import { listGames, getFile, updateFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ params }: Route.LoaderArgs) {
  const games = await listGames();
  const game = games.find((g) => g.slug === params.slug);
  if (!game) throw data("Game not found", { status: 404 });
  return { game };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = Object.fromEntries(await request.formData());
  const parsed = GameSchema.safeParse({
    ...formData,
    active: formData.active === "true",
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }

  const file = await getFile<{ games: Array<Record<string, unknown>> }>("data/_meta/games.json");
  if (!file) return data({ errors: { _form: ["Could not read games.json"] } }, { status: 500 });

  const updated = {
    games: file.content.games.map((g) =>
      g.slug === params.slug ? { ...parsed.data } : g
    ),
  };
  await updateFile("data/_meta/games.json", updated, file.sha, `Update game: ${parsed.data.name}`);
  throw redirect("/games");
}

export default function EditGame({ loaderData }: Route.ComponentProps) {
  const game = loaderData.game;
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit Game</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="slug" value={game.slug} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
              <p className="text-sm text-gray-500">{game.slug}</p>
            </div>
            <FormField name="name" label="Name" defaultValue={game.name} />
            <FormField name="developer" label="Developer" defaultValue={game.developer ?? ""} required={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" value="true" defaultChecked={game.active} className="rounded border-gray-300" />
              <span className="text-gray-700 dark:text-gray-300">Active</span>
            </label>
            <div className="flex gap-2">
              <Button type="submit">Save Changes</Button>
              <a href="/games" className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</a>
            </div>
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
      <input
        id={name}
        name={name}
        type="text"
        required={required}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}
