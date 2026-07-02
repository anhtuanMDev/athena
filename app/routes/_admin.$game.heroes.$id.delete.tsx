import { redirect, data } from "react-router";
import type { Route } from "./+types/_admin.$game.heroes.$id.delete";
import { getFile, deleteFile, listDirectory } from "~/lib/github.server";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";

export async function action({ request, params }: Route.ActionArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);

  const formData = await request.formData();
  const confirmed = formData.get("confirmed") === "true";

  if (!confirmed) {
    const file = await getFile(`data/${params.game}/heroes/${params.id}.json`);
    if (!file) throw data("Hero not found", { status: 404 });

    const patchIds = await listDirectory(params.game, "patches");
    const referencingPatches: string[] = [];
    for (const patchId of patchIds) {
      const patchFile = await getFile<{ changes: Array<{ hero: string }> }>(`data/${params.game}/patches/${patchId}.json`);
      if (patchFile?.content.changes?.some((c) => c.hero === params.id)) {
        referencingPatches.push(patchId);
      }
    }

    return data({ hero: params.id, referencingPatches, needsConfirm: true });
  }

  const file = await getFile(`data/${params.game}/heroes/${params.id}.json`);
  if (!file) throw data("Hero not found", { status: 404 });

  await deleteFile(`data/${params.game}/heroes/${params.id}.json`, file.sha, `Delete hero: ${params.id}`);
  throw redirect(`/${params.game}/heroes`);
}

export async function loader({ params }: Route.LoaderArgs) {
  assertSafeGameSlug(params.game);
  assertSafeEntityId(params.id);

  const file = await getFile(`data/${params.game}/heroes/${params.id}.json`);
  if (!file) throw data("Hero not found", { status: 404 });
  const hero = file.content as { name: string };
  return { hero: { name: hero.name ?? params.id } };
}
