import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.modes.new";
import { ModeSchema } from "~/schemas/mode";
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
  const parsed = ModeSchema.safeParse({ ...formData });
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }
  const exists = await getFile(`data/${params.game}/modes/${parsed.data.id}.json`);
  if (exists) return data({ errors: { id: ["A mode with this ID already exists"] } }, { status: 400 });
  await createFile(`data/${params.game}/modes/${parsed.data.id}.json`, parsed.data, `Add mode: ${parsed.data.name}`);
  recordAdminAttempt(request, true);
  throw redirect(`/${params.game}/modes`);
}

export default function NewMode() {
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Mode</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <FormField name="id" label="Mode ID (kebab-case)" />
            <FormField name="name" label="Name" />
            <FormField name="description" label="Description" required={false} />
            <Button type="submit">Create Mode</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

