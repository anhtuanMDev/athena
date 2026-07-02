import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.modes.new";
import { ModeSchema } from "~/schemas/mode";
import { getFile, createFile } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export async function action({ request, params }: Route.ActionArgs) {
  const formData = Object.fromEntries(await request.formData());
  const parsed = ModeSchema.safeParse({ ...formData });
  if (!parsed.success) {
    return data({ errors: parsed.error.flatten().fieldErrors, values: formData }, { status: 400 });
  }
  const exists = await getFile(`data/${params.game}/modes/${parsed.data.id}.json`);
  if (exists) return data({ errors: { id: ["A mode with this ID already exists"] } }, { status: 400 });
  await createFile(`data/${params.game}/modes/${parsed.data.id}.json`, parsed.data, `Add mode: ${parsed.data.name}`);
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

function FormField({ name, label, required = true }: { name: string; label: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input id={name} name={name} type="text" required={required}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
    </div>
  );
}
