import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.patches.$id";
import { PatchSchema, type Patch } from "~/schemas/patch";
import { getFile, updateFile, deleteFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const file = await getFile<Patch>(`data/${params.game}/patches/${params.id}.json`);
  if (!file) throw data("Patch not found", { status: 404 });
  return { patch: file.content, sha: file.sha };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const sha = formData.get("sha") as string;
    await deleteFile(`data/${params.game}/patches/${params.id}.json`, sha, `Delete patch: ${params.id}`);
    throw redirect(`/${params.game}/patches`);
  }

  const changesRaw = formData.get("_changes") as string;
  let changes = [];
  try { changes = JSON.parse(changesRaw); } catch { /* ignore */ }

  const parsed = PatchSchema.safeParse({
    patch: params.id,
    date: formData.get("date"),
    summary: formData.get("summary") || undefined,
    changes,
  });

  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const current = await getFile(`data/${params.game}/patches/${params.id}.json`);
  if (!current) throw data("Patch not found", { status: 404 });
  await updateFile(`data/${params.game}/patches/${params.id}.json`, parsed.data, current.sha, `Update patch: ${parsed.data.patch}`);
  throw redirect(`/${params.game}/patches`);
}

export default function EditPatch({ loaderData }: Route.ComponentProps) {
  const p = loaderData.patch;
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Patch: {p.patch}</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="patch" value={p.patch} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Patch ID</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{p.patch}</p>
            </div>
            <FormField name="date" label="Date" defaultValue={p.date} type="date" />
            <FormField name="summary" label="Summary" defaultValue={p.summary ?? ""} required={false} />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Changes (JSON array)</label>
              <textarea
                name="_changes"
                rows={8}
                defaultValue={JSON.stringify(p.changes, null, 2)}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <Button type="submit">Save</Button>
          </Form>
          <Form method="post" className="mt-6 pt-4 border-t" onSubmit={(e) => { if (!confirm("Delete this patch?")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="sha" value={loaderData.sha} />
            <Button type="submit" variant="danger">Delete Patch</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, defaultValue, type = "text", required = true }: { name: string; label: string; defaultValue?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
