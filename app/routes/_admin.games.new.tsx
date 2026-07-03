import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.games.new";
import { GameSchema } from "~/schemas/game";
import { getFile, updateFile, ConflictError, isConflictError, conflictResponse } from "~/lib/github.server";
import { checkAdminRateLimit, recordAdminAttempt } from "~/lib/admin-rate-limit.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FormField } from "~/components/FormField";

export async function action({ request }: Route.ActionArgs) {
  const { allowed } = checkAdminRateLimit(request);
  if (!allowed) {
    return data({ errors: { _form: ["Too many requests. Try again later."] } }, { status: 429 });
  }

  const formData = Object.fromEntries(await request.formData());
  const parsed = GameSchema.safeParse({
    ...formData,
    active: formData.active === "true",
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }

  const file = await getFile<{ games: unknown[] }>("data/_meta/games.json");
  if (!file) return data({ errors: { _form: ["Could not read games.json"] } }, { status: 500 });

  if (file.content.games.some((g: unknown) => typeof g === "object" && g !== null && (g as Record<string, unknown>).slug === parsed.data.slug)) {
    return data({ errors: { slug: ["A game with this slug already exists"] }, values: formData }, { status: 400 });
  }

  const updated = { games: [...file.content.games, parsed.data] };
  try {
    await updateFile("data/_meta/games.json", updated, file.sha, `Add game: ${parsed.data.name}`);
  } catch (err) {
    if (isConflictError(err)) {
      return data(conflictResponse(), { status: 409 });
    }
    throw err;
  }
  recordAdminAttempt(request, true);
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
