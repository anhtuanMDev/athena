import { Form, redirect, data, useActionData } from "react-router";
import type { Route } from "./+types/_admin.$game.raw.$type.$id";
import { getFile, updateFile, ConflictError, isConflictError, conflictResponse } from "~/lib/github.server";
import { computeDiff, type DiffEntry } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId, assertSafeEntityType, ENTITY_TYPES } from "~/lib/safe-path";
import { HeroSchema } from "~/schemas/hero";
import { MapSchema } from "~/schemas/map";
import { ModeSchema } from "~/schemas/mode";
import { PatchSchema } from "~/schemas/patch";
import { ItemSchema } from "~/schemas/item";

const typeValidators: Record<string, (data: unknown) => { success: boolean }> = {
  heroes: HeroSchema.safeParse,
  maps: MapSchema.safeParse,
  modes: ModeSchema.safeParse,
  patches: PatchSchema.safeParse,
  items: ItemSchema.safeParse,
};

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityType(params.type);
  assertSafeEntityId(params.id);

  const path = `data/${params.game}/${params.type}/${params.id}.json`;
  const file = await getFile(path);
  if (!file) throw data("File not found", { status: 404 });
  return { content: file.content, sha: file.sha, path, type: params.type };
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityType(params.type);
  assertSafeEntityId(params.id);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const path = `data/${params.game}/${params.type}/${params.id}.json`;
  const rawJson = formData.get("content") as string;

  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch {
    return data({ error: "Invalid JSON", intent: "validate" as const }, { status: 400 });
  }

  const validator = typeValidators[params.type];
  if (validator) {
    const result = validator(parsed);
    if (!result.success) {
      return data({ error: `Validation failed for ${params.type}: the data doesn't match the expected schema` }, { status: 400 });
    }
  }

  const current = await getFile(path);
  if (!current) throw data("File not found", { status: 404 });

  if (intent === "commit") {
    try {
      await updateFile(path, parsed, current.sha, `Update ${params.type}: ${params.id} (raw edit)`);
    } catch (err) {
      if (isConflictError(err)) {
        return data(conflictResponse(), { status: 409 });
      }
      throw err;
    }
    return data({ success: true as const });
  }

  const diffs = computeDiff(current.content, parsed);
  return data({ diffs, rawJson, sha: current.sha, intent: "preview" as const });
}

export default function RawEditor({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<{ diffs?: DiffEntry[]; rawJson?: string; sha?: string; intent?: string; error?: string; success?: boolean }>();

  if (actionData?.intent === "preview" && actionData?.diffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Review Raw Changes</h1>
        <DiffView diffs={actionData.diffs} />
        <Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="commit" />
          <input type="hidden" name="content" value={actionData.rawJson} />
          <Button type="submit">Confirm Commit</Button>
          <Button type="button" variant="secondary" onClick={() => window.history.back()}>Cancel</Button>
        </Form>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold">Raw Editor: {loaderData.path}</h1>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="validate" />
            <textarea
              name="content"
              rows={30}
              defaultValue={JSON.stringify(loaderData.content, null, 2)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {actionData?.error && <p className="text-sm text-red-500">{actionData.error}</p>}
            <Button type="submit">Preview Changes</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
