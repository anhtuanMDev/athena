import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import { computeDiff, type DiffEntry } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug, assertSafeEntityId, assertSafeEntityType, ENTITY_TYPES } from "~/lib/safe-path";
import { HeroSchema } from "~/schemas/hero";
import { MapSchema } from "~/schemas/map";
import { ModeSchema } from "~/schemas/mode";
import { PatchSchema } from "~/schemas/patch";
import { ItemSchema } from "~/schemas/item";
import { useToast } from "~/components/ToastProvider";

const typeValidators: Record<string, (data: unknown) => { success: boolean }> = {
  heroes: (d) => HeroSchema.safeParse(d),
  maps: (d) => MapSchema.safeParse(d),
  modes: (d) => ModeSchema.safeParse(d),
  patches: (d) => PatchSchema.safeParse(d),
  items: (d) => ItemSchema.safeParse(d),
};

export default function RawEditor() {
  const { game, type, id } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityType(type!);
  assertSafeEntityId(id!);

  const path = `data/${game}/${type}/${id}.json`;

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    const file = await getFile(path);
    if (!file) throw new Error("File not found");
    return { content: file.content, sha: file.sha, path, type };
  }, [game, type, id]);

  const [step, setStep] = useState<"editor" | "preview">("editor");
  const [diffs, setDiffs] = useState<DiffEntry[] | null>(null);
  const [commitRawJson, setCommitRawJson] = useState<string | null>(null);
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const rawJson = formData.get("content") as string;

    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); } catch {
      setError("Invalid JSON");
      return;
    }

    const validator = typeValidators[type!];
    if (validator) {
      const result = validator(parsed);
      if (!result.success) {
        setError(`Validation failed for ${type}: the data doesn't match the expected schema`);
        return;
      }
    }

    if (!loaderData) {
      setError("File not found");
      return;
    }

    const resultDiffs = computeDiff(loaderData.content, parsed);
    setDiffs(resultDiffs);
    setCommitRawJson(rawJson);
    setCommitSha(loaderData.sha);
    setStep("preview");
  }

  async function handleCommit() {
    if (!commitRawJson || !commitSha) return;
    setError(null);

    let parsed: unknown;
    try { parsed = JSON.parse(commitRawJson); } catch {
      setError("Invalid JSON");
      return;
    }

    try {
      await updateFile(path, parsed, commitSha, `Update ${type}: ${id} (raw edit)`);
      toastSuccess("Raw edit saved successfully!");
      navigate(`/${game}/${type}`);
    } catch (err) {
      if (isConflictError(err)) {
        setError("Conflict: file was modified since loading. Refresh and re-apply.");
        toastError("Conflict detected! Someone else modified this file.");
      } else {
        toastError("Failed to save changes.");
        throw err;
      }
    }
  }

  if (loading) return <div>Loading...</div>;
  if (loadError) return <div>Error: {(loadError as Error).message}</div>;
  if (!loaderData) return null;

  if (step === "preview" && diffs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Review Raw Changes</h1>
        <DiffView diffs={diffs} />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleCommit}>Confirm Commit</Button>
          <Button onClick={() => setStep("editor")} variant="secondary">Cancel</Button>
        </div>
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
          <form onSubmit={handlePreview} className="space-y-4">
            <textarea
              name="content"
              rows={30}
              defaultValue={JSON.stringify(loaderData.content, null, 2)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit">Preview Changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
