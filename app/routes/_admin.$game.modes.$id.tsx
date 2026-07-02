import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.modes.$id";
import { ModeSchema, type Mode } from "~/schemas/mode";
import { getFile, updateFile, deleteFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function loader({ params }: Route.LoaderArgs) {
  const file = await getFile<Mode>(`data/${params.game}/modes/${params.id}.json`);
  if (!file) throw data("Mode not found", { status: 404 });
  return { mode: file.content, sha: file.sha };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  if (intent === "delete") {
    await deleteFile(`data/${params.game}/modes/${params.id}.json`, formData.get("sha") as string, `Delete mode: ${params.id}`);
    throw redirect(`/${params.game}/modes`);
  }
  const raw = Object.fromEntries(formData);
  const parsed = ModeSchema.safeParse(raw);
  if (!parsed.success) return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  const current = await getFile(`data/${params.game}/modes/${params.id}.json`);
  if (!current) throw data("Mode not found", { status: 404 });
  await updateFile(`data/${params.game}/modes/${params.id}.json`, parsed.data, current.sha, `Update mode: ${parsed.data.name}`);
  throw redirect(`/${params.game}/modes`);
}

export default function EditMode({ loaderData }: Route.ComponentProps) {
  const m = loaderData.mode;
  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">Edit Mode: {m.name}</h1></CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update" />
            <FormField name="name" label="Name" defaultValue={m.name} />
            <FormField name="description" label="Description" defaultValue={m.description ?? ""} required={false} />
            <Button type="submit">Save</Button>
          </Form>
          <Form method="post" className="mt-6 pt-4 border-t" onSubmit={(e) => { if (!confirm("Delete this mode?")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="sha" value={loaderData.sha} />
            <Button type="submit" variant="danger">Delete Mode</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ name, label, defaultValue, required = true }: { name: string; label: string; defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <input id={name} name={name} type="text" required={required} defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
