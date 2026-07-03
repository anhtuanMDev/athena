import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.patches.new";
import { PatchSchema } from "~/schemas/patch";
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
  const formData = await request.formData();
  const changesRaw = formData.get("_changes") as string;
  let changes: Array<{ hero: string; field: string; from?: string; to?: string; note?: string }> = [];
  try {
    changes = changesRaw ? JSON.parse(changesRaw) : [];
  } catch { /* ignore */ }

  const parsed = PatchSchema.safeParse({
    patch: formData.get("patch"),
    date: formData.get("date"),
    summary: formData.get("summary") || undefined,
    changes,
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const exists = await getFile(`data/${params.game}/patches/${parsed.data.patch}.json`);
  if (exists) return data({ errors: { patch: ["A patch with this ID already exists"] } }, { status: 400 });

  await createFile(`data/${params.game}/patches/${parsed.data.patch}.json`, parsed.data, `Add patch: ${parsed.data.patch}`);
  recordAdminAttempt(request, true);
  throw redirect(`/${params.game}/patches`);
}

export default function NewPatch() {
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Patch</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <FormField name="patch" label="Patch ID (e.g. 2026.07)" />
            <FormField name="date" label="Date (ISO)" type="date" />
            <FormField name="summary" label="Summary" required={false} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Changes (JSON array)</label>
              <textarea
                name="_changes"
                rows={5}
                defaultValue={JSON.stringify([{ hero: "", field: "", from: "", to: "", note: "" }], null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <Button type="submit">Create Patch</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

