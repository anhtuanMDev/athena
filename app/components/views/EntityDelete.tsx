import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { deleteFile, getFile, isConflictError, listDirectory } from "~/lib/github";
import { Link } from "react-router";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { useData, clearDataCache } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { getCategoryDirectory, type SchemaCategory } from "~/schemas/dynamic-schema";

interface EntityBase {
  id: string;
  name?: string;
  schema_id?: string;
}

export default function EntityDelete({ entityType }: { entityType: "heroes" | "maps" | "modes" | "patches" | "items" | "schemas" | "cron_jobs" }) {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useData<{ 
    fileData: { sha: string; content?: Record<string, unknown> }; 
    dependencies: { id: string; name: string; targetEntity: string }[];
  } | null>(
    async () => {
      const file = await getFile<Record<string, unknown>>(`data/${game}/${entityType}/${id}.json`);
      if (!file) return null;

      let dependencies: { id: string; name: string; targetEntity: string }[] = [];
      if (entityType === "schemas") {
        const schemaCategory = file.content?.category as SchemaCategory;
        if (schemaCategory) {
          const targetEntity = getCategoryDirectory(schemaCategory);
          
          try {
            // Using keysOnly to avoid pulling full JSON payloads into memory for performance
            const allEntities = await listDirectory<EntityBase>(game!, targetEntity, true, ["id", "name", "schema_id"]);
            const allSchemas = await listDirectory<EntityBase>(game!, "schemas", true, ["id", "category"]);
            
            // @ts-ignore category is populated because it's a schema
            const categorySchemas = allSchemas.filter(s => s && s.category === schemaCategory);
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
          } catch (e) {
            // Ignore if directory doesn't exist yet
          }
        }
      } else {
        try {
          // Check for any deep references (keys or values) across all entity categories
          // This catches mode_overrides-style cross-references, cron_job targets, schema reference_lists, etc.
          const checkDeepReference = (obj: unknown, target: string): boolean => {
            if (!obj) return false;
            if (typeof obj === "string") return obj === target;
            if (Array.isArray(obj)) return obj.some(v => checkDeepReference(v, target));
            if (typeof obj === "object" && obj !== null) {
              for (const [k, v] of Object.entries(obj)) {
                if (k === target || checkDeepReference(v, target)) return true;
              }
            }
            return false;
          };

          const checkCategory = async (category: string) => {
            try {
              const entities = await listDirectory<Record<string, unknown>>(game!, category, true);
              const referencing = entities.filter(e => e && e.id !== id && checkDeepReference(e, id!));
              referencing.forEach(e => dependencies.push({ 
                id: (e.id || e.patch || "unknown") as string, 
                name: (e.name || e.patch || e.id || "Unknown") as string, 
                targetEntity: category 
              }));
            } catch (e) {
              // Ignore if category doesn't exist
            }
          };

          await Promise.all([
            checkCategory("patches"),
            checkCategory("items"),
            checkCategory("modes"),
            checkCategory("maps"),
            checkCategory("heroes"),
            checkCategory("cron_jobs"),
            checkCategory("schemas")
          ]);
        } catch (e) {
          // Ignore
        }
      }
      return { fileData: file, dependencies };
    },
    [game, id, entityType], "EntityDelete-28"
  );

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.fileData) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteFile(`data/${game}/${entityType}/${id}.json`, data.fileData.sha, `Delete ${entityType} ${id}`);
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
      <div className="max-w-md mx-auto py-12 animate-pulse">
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
      </div>
    );
  }
  
  if (!data?.fileData) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
          Entity not found or already deleted.
        </div>
      </div>
    );
  }

  const entitySingularMap: Record<string, string> = {
    heroes: "hero",
    maps: "map",
    modes: "mode",
    patches: "patch",
    items: "item",
    schemas: "schema",
    cron_jobs: "cron job"
  };
  const singularEntity = entitySingularMap[entityType] || entityType.replace(/s$/, "");

  return (
    <div className="max-w-md mx-auto py-12">
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400">Confirm Deletion</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
            Are you sure you want to delete the {singularEntity} <strong>{id}</strong>? This action cannot be undone.
          </p>

          {data.dependencies.length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50">
              <h4 className="text-sm font-bold text-orange-800 dark:text-orange-400 mb-2 capitalize">Cannot Delete {singularEntity}</h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                The following entities are currently referencing this {singularEntity}. You must update them before this {singularEntity} can be deleted.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {data.dependencies.map(dep => (
                  <li key={dep.id} className="text-sm text-orange-700 dark:text-orange-300">
                    <Link to={`/${game}/${dep.targetEntity}/${dep.id}/edit`} className="font-semibold underline hover:text-orange-900 dark:hover:text-orange-200">
                      {dep.name} ({dep.id})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handleDelete} className="flex flex-col sm:flex-row gap-4">
            <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/${entityType}`)} className="flex-1 w-full">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || data.dependencies.length > 0} className={`flex-1 w-full shadow-lg ${data.dependencies.length > 0 ? 'bg-gray-400 text-white cursor-not-allowed shadow-none' : 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/20'}`}>
              {submitting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
