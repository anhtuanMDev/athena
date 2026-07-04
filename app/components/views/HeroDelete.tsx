import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { getFile, deleteFile, listDirectory, isConflictError } from "~/lib/github";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";

export default function DeleteHero() {
  const { game, id } = useParams();
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const { data: heroData, loading, error: loadError } = useData(async () => {
    const file = await getFile<{ name: string }>(`data/${game}/heroes/${id}.json`);
    if (!file) throw new Error("Hero not found");
    return { name: file.content.name ?? id!, sha: file.sha };
  }, [game, id]);

  const [step, setStep] = useState<"confirm" | "references" | "deleting">("confirm");
  const [referencingPatches, setReferencingPatches] = useState<string[]>([]);
  const [referencingItems, setReferencingItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckReferences() {
    setError(null);
    setStep("deleting");

    const file = await getFile(`data/${game}/heroes/${id}.json`);
    if (!file) {
      setError("Hero not found");
      return;
    }

    const patchIds = await listDirectory(game!, "patches");
    const patches: string[] = [];
    for (const patchId of patchIds) {
      const patchFile = await getFile<{ changes: Array<{ hero: string }> }>(`data/${game}/patches/${patchId}.json`);
      if (patchFile?.content.changes?.some((c) => c.hero === id)) {
        patches.push(patchId);
      }
    }

    const itemIds = await listDirectory(game!, "items");
    const items: string[] = [];
    for (const itemId of itemIds) {
      const itemFile = await getFile<{ hero?: string; effects: Array<{ ability_id: string }> }>(`data/${game}/items/${itemId}.json`);
      if (itemFile?.content.hero === id) {
        items.push(itemId);
      }
    }

    setReferencingPatches(patches);
    setReferencingItems(items);
    setStep(patches.length > 0 || items.length > 0 ? "references" : "confirm");
  }

  async function handleForceDelete() {
    setError(null);
    setStep("deleting");

    if (!heroData) return;

    try {
      await deleteFile(`data/${game}/heroes/${id}.json`, heroData.sha, `Delete hero: ${id}`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      if (isConflictError(err)) {
        setError("Conflict: file was modified since loading. Refresh and re-apply.");
        setStep("confirm");
      } else {
        throw err;
      }
    }
  }

  if (loading) return <div>Loading...</div>;
  if (loadError) return <div>Error: {(loadError as Error).message}</div>;
  if (!heroData) return null;

  if (step === "deleting") {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-700 dark:text-gray-300">
              {error || "Checking references..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "references") {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-xl font-bold text-red-600">Cannot Delete: {heroData.name}</h2>
            <p className="text-gray-700 dark:text-gray-300">
              This hero is referenced by other data and cannot be safely removed.
            </p>
            {referencingPatches.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Referenced in Patches:</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                  {referencingPatches.map((pid) => <li key={pid}>{pid}</li>)}
                </ul>
              </div>
            )}
            {referencingItems.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Referenced in Items:</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                  {referencingItems.map((iid) => <li key={iid}>{iid}</li>)}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleForceDelete} variant="destructive">Force Delete Anyway</Button>
              <Button onClick={() => window.history.back()} variant="secondary">Go Back</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8">
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-xl font-bold text-red-600">Delete Hero: {heroData.name}</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete {heroData.name}? This action will check for any existing references that might prevent safe deletion.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCheckReferences} variant="destructive">Delete</Button>
            <Button onClick={() => window.history.back()} variant="secondary">Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
