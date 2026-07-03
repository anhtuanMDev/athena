import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.maps.new";
import { MapSchema } from "~/schemas/map";
import { getFile, createFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { checkAdminRateLimit, recordAdminAttempt } from "~/lib/admin-rate-limit.server";

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  const { allowed } = checkAdminRateLimit(request);
  if (!allowed) {
    return data({ errors: { _form: ["Too many requests. Try again later."] } }, { status: 429 });
  }
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
  recordAdminAttempt(request, true);
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

