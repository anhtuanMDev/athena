import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import type { SchemaFile } from "~/schemas/schema-file";
import { computeDiff } from "~/lib/diff";
import type { DiffEntry } from "~/lib/diff";
import { DiffView } from "~/components/DiffView";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug, assertSafeEntityId } from "~/lib/safe-path";
import { buildHeroFromFormData, coerceKitParams } from "~/lib/parse-kit";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

const EMPTY_ARRAYS: never[] = [];

export default function EditHero() {
  const { game, id } = useParams();
  assertSafeGameSlug(game!);
  assertSafeEntityId(id!);

  const heroResult = useData<{ content: Hero; sha: string } | null>(
    () => getFile<Hero>(`data/${game}/heroes/${id}.json`),
    [game, id]
  );
  const schemaResult = useData<{ content: { roles: string[] } } | null>(
    () => getFile<{ roles: string[]; ability_types: string[] }>(`data/${game}/schema.json`),
    [game]
  );

  if (heroResult.loading || schemaResult.loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          </div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded-lg mt-8"></div>
        </div>
      </div>
    );
  }
  if (heroResult.error) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Failed to load hero</h3>
        <p>{String(heroResult.error)}</p>
      </div>
    );
  }
  if (!heroResult.data) {
    return <div className="text-red-500 p-4">Hero not found</div>;
  }

  return (
    <EditHeroForm
      key={heroResult.data.sha}
      hero={heroResult.data.content}
      sha={heroResult.data.sha}
      roles={schemaResult.data?.content.roles ?? EMPTY_ARRAYS}
      game={game!}
      id={id!}
    />
  );
}

function EditHeroForm({
  hero, sha, roles, game, id,
}: {
  hero: Hero; sha: string; roles: string[]; game: string; id: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [abilities, setAbilities] = useState(hero.kit);
  const [preview, setPreview] = useState<{ diffs: DiffEntry[]; heroJson: string; sha: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingCommit, setSubmittingCommit] = useState(false);

  function addAbility() {
    setAbilities([...abilities, { id: "", name: "", type: "", description: "", params: {} }]);
  }

  function removeAbility(i: number) {
    setAbilities(abilities.filter((_, idx) => idx !== i));
  }

  async function handlePreviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const heroData = buildHeroFromFormData(formData, game, id);
      const schemaFile = await getFile<SchemaFile>(`data/${game}/schema.json`);
      if (schemaFile) {
        const rawKit = heroData.kit;
        if (Array.isArray(rawKit)) {
          heroData.kit = coerceKitParams(rawKit as Hero["kit"], schemaFile.content.stat_fields);
        }
      }

      const parsed = HeroSchema.safeParse(heroData);
      if (!parsed.success) {
        const msgs = Object.values(parsed.error.flatten().fieldErrors).flat();
        setError(msgs.length > 0 ? msgs.join("; ") : "Validation failed");
        toastError("Form validation failed. Check fields.");
        return;
      }

      const diffs = computeDiff(hero, parsed.data);
      setPreview({ diffs, heroJson: JSON.stringify(parsed.data), sha: sha });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
        toastError(err.message);
      } else {
        setError("Error");
        toastError("An unknown error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCommit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preview) return;
    setSubmittingCommit(true);
    setError(null);
    try {
      const parsed = HeroSchema.safeParse(JSON.parse(preview.heroJson));
      if (!parsed.success) {
        setError("Hero data failed validation on commit");
        toastError("Validation failed on commit");
        return;
      }
      await updateFile(
        `data/${game}/heroes/${id}.json`,
        parsed.data,
        sha, // Use the original SHA from initial load
        `Update hero: ${parsed.data.name}`
      );
      toastSuccess(`Hero ${parsed.data.name} updated successfully!`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      if (isConflictError(err)) {
        setError("Conflict detected. The file has been modified. Please try again.");
        toastError("Conflict detected! Someone else modified this file.");
      } else {
        const msg = err instanceof Error ? err.message : "Error";
        setError(msg);
        toastError(`Failed to save: ${msg}`);
      }
    } finally {
      setSubmittingCommit(false);
    }
  }

  if (preview) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Review Changes</h1>
        <DiffView diffs={preview.diffs} />
        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800/50">{error}</p>}
        <form onSubmit={handleCommit} className="flex gap-4 pt-4">
          <input type="hidden" name="_heroJson" value={preview.heroJson} />
          <Button type="submit" disabled={submittingCommit} className="shadow-lg shadow-orange-500/20 w-40">
            {submittingCommit ? "Committing..." : "Confirm Commit"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setPreview(null); setError(null); }} className="w-32 bg-gray-100 dark:bg-gray-800">
            Cancel
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit: {hero.name}</h1>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <form onSubmit={handlePreviewSubmit} className="space-y-4">
            <input type="hidden" name="_kitCount" value={String(abilities.length)} />

            <div className="grid grid-cols-2 gap-4">
              <FormField name="name" label="Name" defaultValue={hero.name} />
              <FormField name="portrait" label="Portrait URL" defaultValue={hero.portrait} />
            </div>

            <FormField name="roles" label={`Roles (${roles.join(", ")})`} defaultValue={hero.roles.join(", ")} />
            <div className="grid grid-cols-2 gap-4">
              <FormField name="difficulty" label="Difficulty (1-5)" type="number" defaultValue={String(hero.difficulty ?? "")} required={false} />
              <FormField name="health" label="Health (JSON)" defaultValue={hero.health ? JSON.stringify(hero.health) : ""} required={false} />
            </div>
            <FormField name="bio" label="Bio" defaultValue={hero.bio ?? ""} required={false} />
            <FormField name="tags" label="Tags (comma-separated)" defaultValue={hero.tags?.join(", ") ?? ""} required={false} />

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
              <div className="space-y-3">
                {abilities.map((ability, i) => (
                  <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Ability {i + 1}</span>
                      <button type="button" onClick={() => removeAbility(i)}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                    <input type="hidden" name={`_kit_${i}_params_keys`} value={Object.keys(ability.params).join(",")} />
                    {ability.mode_overrides ? <input type="hidden" name={`_kit_${i}_mode_overrides`} value={JSON.stringify(ability.mode_overrides)} /> : null}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <input name={`kit_${i}_id`} defaultValue={ability.id} placeholder="id"
                        className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <input name={`kit_${i}_name`} defaultValue={ability.name} placeholder="name"
                        className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      <input name={`kit_${i}_type`} defaultValue={ability.type} placeholder="type"
                        className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    </div>
                    <input name={`kit_${i}_description`} defaultValue={ability.description ?? ""} placeholder="description"
                      className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    {Object.entries(ability.params).map(([key, val]) => (
                      <div key={key} className="mt-1">
                        <label className="text-xs text-gray-500">{key}</label>
                        <input name={`kit_${i}_params_${key}`} defaultValue={String(val ?? "")}
                          className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAbility}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">
                + Add Ability
              </button>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Processing..." : "Preview Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
