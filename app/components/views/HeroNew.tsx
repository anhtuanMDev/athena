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
import { useToast } from "~/components/ToastProvider";

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

  if (loading) {
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

  if (error) return (
    <div className="max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
      <p>{String(error)}</p>
    </div>
  );
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Hero — {data.game}</h1>
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
  const { success: toastSuccess, error: toastError } = useToast();
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
        toastError("Form validation failed. Please check the fields.");
        return;
      }

      if (!parsed.data.kit.length) {
        setErrors({ _form: ["At least one ability is required"] });
        toastError("A hero must have at least one ability in their kit.");
        return;
      }

      const exists = await getFile(`data/${game}/heroes/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["A hero with this ID already exists"] });
        toastError("A hero with this ID already exists.");
        return;
      }

      await createFile(`data/${game}/heroes/${parsed.data.id}.json`, parsed.data, `Add hero: ${parsed.data.name}`);
      toastSuccess(`Hero ${parsed.data.name} created successfully!`);
      navigate(`/${game}/heroes`);
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create hero: ${msg}`);
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

      <div className="pt-4">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 tracking-wider uppercase">Kit Abilities</h3>
        <div className="space-y-3">
          {abilities.map((_, i) => (
            <div key={i} className="p-4 border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ability {i + 1}</span>
                <button type="button" onClick={() => removeAbility(i)}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">Remove</button>
              </div>
              <input type="hidden" name={`_kit_${i}_params_keys`} value="" />
              <div className="grid grid-cols-3 gap-3 mb-3">
                <input name={`kit_${i}_id`} placeholder="id (kebab-case)"
                  className="block w-full rounded-lg border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100" />
                <input name={`kit_${i}_name`} placeholder="name"
                  className="block w-full rounded-lg border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100" />
                <input name={`kit_${i}_type`} placeholder="type"
                  className="block w-full rounded-lg border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100" />
              </div>
              <input name={`kit_${i}_description`} placeholder="description (optional)"
                className="block w-full rounded-lg border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100" />
            </div>
          ))}
        </div>
        <button type="button" onClick={addAbility}
          className="mt-4 text-sm font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 inline-flex items-center gap-1">
          + Add Ability
        </button>
      </div>

      <div className="pt-4">
        <Button type="submit" disabled={submitting} className="shadow-lg shadow-violet-500/20 w-40">
          {submitting ? "Creating..." : "Create Hero"}
        </Button>
      </div>
    </form>
  );
}
