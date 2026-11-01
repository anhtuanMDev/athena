import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { getFile, updateFile, isConflictError, listDirectory } from "~/lib/github";
import { computeDiff, type DiffEntry } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug, assertSafeEntityId, assertSafeEntityType, ENTITY_TYPES } from "~/lib/safe-path";
import { recordSchemaFor } from "~/lib/record-schema";
import { CATEGORIES } from "~/lib/screen-model";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { useToast } from "~/components/ToastProvider";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

/** Problems with `parsed` as a record of `type`, checked as its category's editor checks it; empty when it can be saved. */
function recordProblems(type: string, schemas: DynamicSchemaFile[], parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ["A record must be a JSON object."];
  const category = CATEGORIES.find((c) => c.folder === type)?.category;
  const result = recordSchemaFor(type, schemas.filter((s) => s?.category === category), parsed as Record<string, unknown>).safeParse(parsed);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".") || "record"}: ${i.message}`);
}

export default function RawEditor() {
  const { game, "*": splat } = useParams();
  const type = splat?.split("/")[1];
  const id = splat?.split("/")[2];
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  assertSafeGameSlug(game!);
  assertSafeEntityType(type!);
  assertSafeEntityId(id!);

  const path = `data/${game}/${type}/${id}.json`;

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    const [file, schemas] = await Promise.all([getFile(path), listDirectory<DynamicSchemaFile>(game!, "schemas", true)]);
    if (!file) throw new Error("NOT_FOUND");
    return { content: file.content, sha: file.sha, path, type, schemas };
  }, [game, type, id], "RawEdit-37");

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

    if (!loaderData) {
      setError("NOT_FOUND");
      return;
    }

    const problems = recordProblems(type!, loaderData.schemas, parsed);
    if (problems.length > 0) {
      setError(`Validation failed for ${type}: ${problems.join("; ")}`);
      return;
    }

    const resultDiffs = computeDiff(loaderData.content, parsed);
    setDiffs(resultDiffs);
    setCommitRawJson(rawJson);
    setCommitSha(loaderData.sha);
    setStep("preview");
  }

  async function handleCommit() {
    if (!commitRawJson || !commitSha || !loaderData) return;
    setError(null);

    let parsed: unknown;
    try { parsed = JSON.parse(commitRawJson); } catch {
      setError("Invalid JSON");
      return;
    }

    const problems = recordProblems(type!, loaderData.schemas, parsed);
    if (problems.length > 0) {
      setError(`Validation failed for ${type} on commit: ${problems.join("; ")}`);
      toastError("Validation failed on commit!");
      return;
    }

    try {
      await updateFile(path, parsed, commitSha, `Update ${type}: ${id} (raw edit)`);
      toastSuccess("Raw edit saved successfully!");
      navigate(`/${game}/${type}`);
    } catch (err) {
      if (isConflictError(err)) {
        setError((err as Error).message);
        toastError((err as Error).message);
      } else {
        toastError("Failed to save changes.");
        throw err;
      }
    }
  }

  if (loading) return <div>Loading…</div>;
  if (loadError) {
    const isNotFound = String(loadError).includes("NOT_FOUND") || loadError === "NOT_FOUND";
    if (isNotFound) {
      return (
        <div className="w-full py-12">
          <EmptyState
            title="File Not Found"
            description="The file you are trying to edit could not be found or has been deleted."
            action={<Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>}
          />
        </div>
      );
    }
    return (
      <LoadErrorState
        title="Failed to Load Data"
        error={loadError}
        onBack={() => window.history.back()}
      />
    );
  }
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
            <textarea aria-label="JSON content"
              name="content"
              rows={30}
              defaultValue={JSON.stringify(loaderData.content, null, 2)}
              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:text-gray-100"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit">Preview Changes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
