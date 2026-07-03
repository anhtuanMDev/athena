import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { buildHeroFromFormData, coerceKitParams } from "~/lib/parse-kit";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

interface AbilityForm {
  id: string; name: string; type: string; description: string;
}

export default function NewHero() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const schemaFile = await getFile<{ roles: string[]; ability_types: string[]; stat_fields: Record<string, { type: string }> }>(`data/${game!}/schema.json`);
    if (!schemaFile) throw new Error("Game schema not found");
    return { roles: schemaFile.content.roles, abilityTypes: schemaFile.content.ability_types, statFields: schemaFile.content.stat_fields, game: game! };
  }, [game]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Hero — {data.game}</h1>
        </CardHeader>
        <CardContent>
          <HeroForm roles={data.roles} abilityTypes={data.abilityTypes} statFields={data.statFields} game={data.game} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({ roles, abilityTypes, statFields, game }: { roles: string[]; abilityTypes: string[]; statFields: Record<string, { type: string }>; game: string }) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [abilities, setAbilities] = useState<AbilityForm[]>([]);

  function addAbility() {
    setAbilities([...abilities, { id: "", name: "", type: "", description: "" }]);
  }

  function removeAbility(i: number) {
    setAbilities(abilities.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    const raw = Object.fromEntries(formData);
    const id = raw.id as string;

    try {
      const hero = buildHeroFromFormData(formData, game, id);
      const rawKit = hero.kit;
      if (Array.isArray(rawKit)) {
        hero.kit = coerceKitParams(rawKit as Hero["kit"], statFields);
      }

      const parsed = HeroSchema.safeParse(hero);
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      if (!parsed.data.kit.length) {
        setErrors({ _form: ["At least one ability is required"] });
        return;
      }

      const exists = await getFile(`data/${game}/heroes/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["A hero with this ID already exists"] });
        return;
      }

      await createFile(`data/${game}/heroes/${parsed.data.id}.json`, parsed.data, `Add hero: ${parsed.data.name}`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      setErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="_kitCount" value={String(abilities.length)} />

      {errors?._form && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{errors._form.join(", ")}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField name="id" label="Hero ID" placeholder="e.g. tracer" />
        <FormField name="name" label="Name" placeholder="e.g. Tracer" />
      </div>

      <FormField name="roles" label={`Roles (${roles.join(", ")})`} placeholder="e.g. damage" />
      <FormField name="portrait" label="Portrait URL" placeholder="https://..." />
      <div className="grid grid-cols-2 gap-4">
        <FormField name="difficulty" label="Difficulty (1-5)" type="number" required={false} />
        <FormField name="health" label="Health (JSON)" placeholder='{"health": 200}' required={false} />
      </div>
      <FormField name="bio" label="Bio (optional)" required={false} />
      <FormField name="tags" label="Tags (comma-separated, optional)" required={false} />

      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kit Abilities</h3>
        <div className="space-y-3">
          {abilities.map((_, i) => (
            <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Ability {i + 1}</span>
                <button type="button" onClick={() => removeAbility(i)}
                  className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input type="hidden" name={`_kit_${i}_params_keys`} value="" />
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input name={`kit_${i}_id`} placeholder="id (kebab-case)"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_name`} placeholder="name"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                <input name={`kit_${i}_type`} placeholder="type"
                  className="block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <input name={`kit_${i}_description`} placeholder="description (optional)"
                className="mt-1 block w-full rounded border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
            </div>
          ))}
        </div>
        <button type="button" onClick={addAbility}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400">
          + Add Ability
        </button>
      </div>

      <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Hero"}</Button>
    </form>
  );
}
