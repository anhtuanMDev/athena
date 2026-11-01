import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { deleteFile, deleteRecord, getFile, getRecordAssets, listDirectoryChecked } from "~/lib/github";
import { Link } from "react-router";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/EmptyState";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { useData, clearDataCache } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { getCategoryDirectory, type SchemaCategory } from "~/schemas/dynamic-schema";
import { useCategories } from "~/lib/categories-context";
import { deletionPlan, dependents, recordAssetDir, scanRecords, type DeletionPlan, type Listing } from "~/lib/record-assets";

interface EntityBase {
  id: string;
  name?: string;
  schema_id?: string;
  category?: string;
}

/** A record's pictures as the page found them: the commit it read them at, and which go with the record. */
interface Pictures {
  head: string;
  /** null when what uses them couldn't be checked: then they all stay. */
  plan: DeletionPlan | null;
  count: number;
}

/**
 * Deletes a record of a category folder, or a schema, job or enum. A record's
 * own pictures (record-assets.ts) go with it, in the same commit, except those
 * another record still uses. If anything that could use the record can't be
 * read, the page says so and asks again, and the pictures stay.
 */
export default function EntityDelete({ entityType }: { entityType: string }) {
  const categories = useCategories();
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncheckedOk, setUncheckedOk] = useState(false);

  const { data, loading } = useData<{
    fileData: { sha: string; content?: Record<string, unknown> };
    dependencies: { id: string; name: string; targetEntity: string }[];
    /** What couldn't be read for the checks: then they can't be trusted. */
    unread: string[];
    pictures: Pictures | null;
  } | null>(
    async () => {
      const file = await getFile<Record<string, unknown>>(`data/${game}/${entityType}/${id}.json`);
      if (!file) return null;

      const self = { folder: entityType, id: id! };
      const unread: string[] = [];
      const load = (folder: string, keys?: string[]) => listDirectoryChecked(game!, folder, keys);
      let dependencies: { id: string; name: string; targetEntity: string }[] = [];
      if (entityType === "schemas") {
        const schemaCategory = file.content?.category as SchemaCategory;
        if (schemaCategory) {
          const targetEntity = categories.find((c) => c.category === schemaCategory)?.folder ?? getCategoryDirectory(schemaCategory);
          // Using keysOnly to avoid pulling full JSON payloads into memory for performance
          const [entities, schemas] = await Promise.all([
            load(targetEntity, ["id", "name", "schema_id"]).catch((): Listing => ({ items: [], complete: false })),
            load("schemas", ["id", "category"]).catch((): Listing => ({ items: [], complete: false })),
          ]);
          if (!entities.complete) unread.push(targetEntity);
          if (!schemas.complete) unread.push("schemas");
          const allEntities = entities.items as EntityBase[];
          const categorySchemas = (schemas.items as EntityBase[]).filter((s) => s && s.category === schemaCategory);
          const defaultSchema = categorySchemas.find(s => s.id === `base-${schemaCategory}`)
                             || categorySchemas.find(s => s.id === `default-${schemaCategory}`)
                             || categorySchemas[0];
          const isDefaultSchema = defaultSchema?.id === id;

          dependencies = allEntities.filter(e => {
            if (!e) return false;
            if (e.schema_id === id) return true;
            if (!e.schema_id && isDefaultSchema) return true;
            return false;
          }).map(e => ({ id: e.id, name: e.name || e.id, targetEntity }));
        }
        return { fileData: file, dependencies, unread, pictures: null };
      }

      // The record's pictures first, so the commit they're read at comes before every check below.
      const hasPictures = entityType !== "cron_jobs";
      const assets = hasPictures ? await getRecordAssets(game!, entityType, id!).catch(() => null) : null;
      if (hasPictures && !assets) unread.push("its pictures");
      const files = assets?.files ?? [];

      // Any record that holds the id (keys or values), across the categories, jobs and schemas: mode_overrides-style
      // cross-references, cron_job targets, schema reference_lists. With pictures, also everything else that may
      // show one: enums, screens, import state, the navigation and the games' and categories' files.
      const usesFolders = [...categories.map((c) => c.folder), "cron_jobs", "schemas"];
      const pictureFolders = files.length > 0 ? ["enums", "screens", "syncs"] : [];
      const loneFiles = files.length > 0 ? [`data/${game}/navigation.json`, "data/_meta/games.json", "data/_meta/categories.json"] : [];
      const [folders, lone] = await Promise.all([
        scanRecords([...new Set([...usesFolders, ...pictureFolders])], (folder) => load(folder)),
        scanRecords(loneFiles, async (path) => {
          const found = await getFile(path);
          return { items: found ? [found.content] : [], complete: true };
        }),
      ]);
      unread.push(...folders.unread, ...lone.unread);
      dependencies = dependents(folders.records.filter((r) => usesFolders.includes(r.folder)), self).map(({ folder, content }) => {
        const e = (content ?? {}) as Record<string, unknown>;
        return { id: String(e.id || e.patch || "unknown"), name: String(e.name || e.patch || e.id || "Unknown"), targetEntity: folder };
      });

      const pictures: Pictures | null = assets && files.length > 0
        ? { head: assets.head, count: files.length, plan: unread.length > 0 ? null : deletionPlan(recordAssetDir(game!, entityType, id!), files, [...folders.records, ...lone.records], self) }
        : null;
      return { fileData: file, dependencies, unread, pictures };
    },
    [game, id, entityType, categories], "EntityDelete-28"
  );

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.fileData) return;
    setSubmitting(true);
    setError(null);
    const plan = data.pictures?.plan;
    try {
      if (data.pictures && plan && plan.remove.length > 0) {
        await deleteRecord({
          game: game!,
          folder: entityType,
          id: id!,
          sha: data.fileData.sha,
          head: data.pictures.head,
          remove: plan.remove,
          keep: plan.keep.map((k) => k.path),
        });
      } else {
        await deleteFile(`data/${game}/${entityType}/${id}.json`, data.fileData.sha, `Delete ${entityType} ${id}`);
      }
      toastSuccess(`Successfully deleted ${id}`);
      clearDataCache();
      navigate(`/${game}/${entityType}`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toastError(`Failed to delete: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-12 animate-pulse motion-reduce:animate-none">
        <div className="h-64 bg-border rounded-xl"></div>
      </div>
    );
  }
  
  if (!data?.fileData) {
    return (
      <div className="max-w-md mx-auto py-12">
        <EmptyState
          title="Entity Not Found"
          description="Entity not found or already deleted."
          action={<Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>}
        />
      </div>
    );
  }

  const entitySingularMap: Record<string, string> = {
    heroes: "hero",
    maps: "map",
    modes: "mode",
    patches: "patch",
    news: "news article",
    items: "item",
    schemas: "schema",
    cron_jobs: "cron job"
  };
  const singularEntity =
    categories.find((c) => c.folder === entityType)?.singular.toLowerCase() ?? entitySingularMap[entityType] ?? entityType.replace(/s$/, "");

  // Nothing may use it; and if that couldn't be checked, the admin must say to go ahead regardless.
  const blocked = data.dependencies.length > 0 || (data.unread.length > 0 && !uncheckedOk);

  return (
    <div className="max-w-md mx-auto py-12">
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400">Confirm Deletion</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink mb-6">
            Are you sure you want to delete the {singularEntity} <strong>{id}</strong>? Only the data repository&apos;s Git history can bring it back.
          </p>

          {data.dependencies.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50">
              <h4 className="text-sm font-bold text-orange-800 dark:text-orange-400 mb-2 capitalize">Cannot Delete {singularEntity}</h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                The following entities are currently referencing this {singularEntity}. You must update them before this {singularEntity} can be deleted.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {data.dependencies.map(dep => (
                  <li key={`${dep.targetEntity}/${dep.id}`} className="text-sm text-orange-700 dark:text-orange-300">
                    <Link to={`/${game}/${dep.targetEntity}/${dep.id}/edit`} className="font-semibold underline hover:text-orange-900 dark:hover:text-orange-200">
                      {dep.name} ({dep.id})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.unread.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50">
              <h4 className="text-sm font-bold text-orange-800 dark:text-orange-400 mb-2">Couldn&apos;t check what uses this record</h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                Some of the data couldn&apos;t be read ({data.unread.join(", ")}), so other records may still use this {singularEntity}.
                {data.pictures ? ` Its ${data.pictures.count} picture${data.pictures.count === 1 ? "" : "s"} will be kept.` : ""} Reloading may help.
              </p>
              <label className="flex items-start gap-2 text-sm text-orange-800 dark:text-orange-300 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={uncheckedOk} onChange={(e) => setUncheckedOk(e.target.checked)} />
                Delete it anyway, without that check
              </label>
            </div>
          )}

          {data.pictures?.plan && (
            <div className="mb-6 p-4 rounded-xl bg-surface-raised border border-border text-sm">
              {data.pictures.plan.remove.length > 0 && (
                <>
                  <h4 className="font-bold text-ink mb-2">
                    Also deletes {data.pictures.plan.remove.length} picture{data.pictures.plan.remove.length === 1 ? "" : "s"} from its folder
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 mb-3 last:mb-0 font-mono text-xs text-ink-muted break-all">
                    {data.pictures.plan.remove.map((f) => (
                      <li key={f.path}>{f.path.slice("public/".length)}</li>
                    ))}
                  </ul>
                </>
              )}
              {data.pictures.plan.keep.length > 0 && (
                <>
                  <h4 className="font-bold text-ink mb-2">Keeps {data.pictures.plan.keep.length} still used elsewhere</h4>
                  <ul className="list-disc pl-5 space-y-1 mb-3 last:mb-0 font-mono text-xs text-ink-muted break-all">
                    {data.pictures.plan.keep.map((f) => (
                      <li key={f.path}>{f.path.slice("public/".length)} <span className="font-sans">(used by {f.usedBy.join(", ")})</span></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleDelete} className="flex flex-col sm:flex-row gap-4">
            <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/${entityType}`)} className="flex-1 w-full">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || blocked} className={`flex-1 w-full shadow-lg ${blocked ? 'bg-gray-400 text-white cursor-not-allowed shadow-none' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
              {submitting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
