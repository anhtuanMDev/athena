import { Form, redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.modes.$id";
import { ModeSchema, type Mode } from "~/schemas/mode";
import { getFile, updateFile, deleteFile, listDirectory, ConflictError, isConflictError, conflictResponse } from "~/lib/github.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { checkAdminRateLimit, recordAdminAttempt } from "~/lib/admin-rate-limit.server";

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const file = await getFile<Mode>(`data/${params.game}/modes/${params.id}.json`);
  if (!file) throw data("Mode not found", { status: 404 });
  return { mode: file.content, sha: file.sha };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);
  const { allowed } = checkAdminRateLimit(request);
  if (!allowed) {
    return data({ errors: { _form: ["Too many requests. Try again later."] } }, { status: 429 });
  }
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  if (intent === "delete") {
    const confirmed = formData.get("confirmed") === "true";
    if (!confirmed) {
      const itemIds = await listDirectory(params.game, "items");
      const referencingItems: string[] = [];
      for (const itemId of itemIds) {
        const itemFile = await getFile<{ mode?: string }>(`data/${params.game}/items/${itemId}.json`);
        if (itemFile?.content.mode === params.id) referencingItems.push(itemId);
      }

      const heroIds = await listDirectory(params.game, "heroes");
      const referencingHeroes: string[] = [];
      for (const heroId of heroIds) {
        const heroFile = await getFile<{ kit: Array<{ mode_overrides?: Record<string, unknown> }> }>(`data/${params.game}/heroes/${heroId}.json`);
        if (heroFile?.content.kit?.some((a) => a.mode_overrides && params.id in a.mode_overrides)) {
          referencingHeroes.push(heroId);
        }
      }

      return data({ mode: params.id, referencingItems, referencingHeroes, needsConfirm: true });
    }
    const current = await getFile(`data/${params.game}/modes/${params.id}.json`);
    if (!current) throw data("Mode not found", { status: 404 });
    try {
      await deleteFile(`data/${params.game}/modes/${params.id}.json`, current.sha, `Delete mode: ${params.id}`);
    } catch (err) {
      if (isConflictError(err)) {
        return data(conflictResponse(), { status: 409 });
      }
      throw err;
    }
    recordAdminAttempt(request, true);
    throw redirect(`/${params.game}/modes`);
  }
  const raw = Object.fromEntries(formData);
  const parsed = ModeSchema.safeParse(raw);
  if (!parsed.success) return data({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const current = await getFile(`data/${params.game}/modes/${params.id}.json`);
    if (!current) throw data("Mode not found", { status: 404 });
    try {
      await updateFile(`data/${params.game}/modes/${params.id}.json`, parsed.data, current.sha, `Update mode: ${parsed.data.name}`);
    } catch (err) {
      if (isConflictError(err)) {
        return data(conflictResponse(), { status: 409 });
      }
      throw err;
    }
    recordAdminAttempt(request, true);
    throw redirect(`/${params.game}/modes`);
}

export default function EditMode({ loaderData, actionData }: Route.ComponentProps) {
  const m = loaderData.mode;

  const deleteConfirm = actionData && "needsConfirm" in actionData
    ? actionData as { mode: string; referencingItems: string[]; referencingHeroes: string[]; needsConfirm: boolean }
    : null;

  if (deleteConfirm?.needsConfirm) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader><h1 className="text-xl font-bold text-red-600">Delete Mode: {m.name}?</h1></CardHeader>
          <CardContent className="space-y-4">
            {deleteConfirm.referencingItems.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p className="font-medium text-yellow-800">This mode is referenced by {deleteConfirm.referencingItems.length} item(s):</p>
                <p className="text-yellow-700">{deleteConfirm.referencingItems.join(", ")}</p>
                <p className="text-yellow-700 mt-1">These references will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingHeroes.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p className="font-medium text-yellow-800">This mode has mode_overrides in {deleteConfirm.referencingHeroes.length} hero(es):</p>
                <p className="text-yellow-700">{deleteConfirm.referencingHeroes.join(", ")}</p>
                <p className="text-yellow-700 mt-1">These overrides will become dangling.</p>
              </div>
            )}
            {deleteConfirm.referencingItems.length === 0 && deleteConfirm.referencingHeroes.length === 0 && (
              <p className="text-sm text-gray-600">No other entities reference this mode.</p>
            )}
            <div className="flex gap-2">
              <Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="sha" value={loaderData.sha} />
                <input type="hidden" name="confirmed" value="true" />
                <Button type="submit" variant="destructive">Delete Anyway</Button>
              </Form>
              <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <Form method="post" className="mt-6 pt-4 border-t">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="sha" value={loaderData.sha} />
            <Button type="submit" variant="destructive">Delete Mode</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

