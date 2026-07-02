import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.games.new";
import { GameSchema } from "~/schemas/game";
import { listGames, getFile, updateFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function action({ request }: Route.ActionArgs) {
  const formData = Object.fromEntries(await request.formData());
  const parsed = GameSchema.safeParse({
    ...formData,
    active: formData.active === "true",
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }

  const existing = await listGames();
  if (existing.some((g) => g.slug === parsed.data.slug)) {
    return data({ errors: { slug: ["A game with this slug already exists"] }, values: formData }, { status: 400 });
  }

  const file = await getFile<{ games: unknown[] }>("data/_meta/games.json");
  if (!file) return data({ errors: { _form: ["Could not read games.json"] } }, { status: 500 });

  const updated = { games: [...file.content.games, parsed.data] };
  await updateFile("data/_meta/games.json", updated, file.sha, `Add game: ${parsed.data.name}`);
  throw redirect("/games");
}

export default function NewGame() {
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Add Game</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <FormField name="slug" label="Slug" placeholder="e.g. overwatch" />
            <FormField name="name" label="Name" placeholder="e.g. Overwatch 2" />
            <FormField name="developer" label="Developer" placeholder="e.g. Blizzard Entertainment" required={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" value="true" defaultChecked className="rounded border-gray-300" />
              <span className="text-gray-700 dark:text-gray-300">Active</span>
            </label>
            <Button type="submit">Create Game</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, placeholder, required = true }: { name: string; label: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}
