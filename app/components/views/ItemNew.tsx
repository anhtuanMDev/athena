
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ItemSchema } from "~/schemas/item";
import { getFile, createFile, listDirectory } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";

export default function NewItem() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  
  const { data, loading, error } = useData(async () => {
    const heroIds = await listDirectory(game!, "heroes");
    const modeIds = await listDirectory(game!, "modes");
    
    // Load schemas
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const itemSchemas = schemas.filter(s => s && s.category === "item");
    const allFields: DynamicField[] = [];
    for (const s of itemSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    
    return { heroes: heroIds, modes: modeIds, fields: allFields, schemaCount: itemSchemas.length, game: game! };
  }, [game]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = new FormData(e.currentTarget);
    const raw = Object.fromEntries(formData);

    let effects: Array<{ ability_id: string }> = [];
    if (raw.effects_raw as string) {
      try {
        effects = JSON.parse(raw.effects_raw as string);
      } catch {
        setErrors({ _form: ["Invalid JSON syntax in Effects field."] });
        toastError("Invalid JSON syntax in Effects field.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const parsed = ItemSchema.safeParse({
        id: raw.id,
        game,
        name: raw.name,
        description: raw.description || undefined,
        hero: (raw.hero as string) || undefined,
        mode: (raw.mode as string) || undefined,
        effects,
      });

      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
        toastError("Validation failed. Check your inputs.");
        return;
      }

      const heroIds = new Set(await listDirectory(game!, "heroes"));
      const modeIds = new Set(await listDirectory(game!, "modes"));

      if (parsed.data.hero && !heroIds.has(parsed.data.hero)) {
        const msg = `Unknown hero "${parsed.data.hero}"`;
        setErrors({ _form: [msg] });
        toastError(msg);
        return;
      }
      if (parsed.data.mode && !modeIds.has(parsed.data.mode)) {
        const msg = `Unknown mode "${parsed.data.mode}"`;
        setErrors({ _form: [msg] });
        toastError(msg);
        return;
      }

      if (!parsed.data.hero) {
        for (const effect of parsed.data.effects) {
          if (effect.ability_id) {
            const msg = `Universal items (no hero) cannot reference a hero-specific ability. Remove "ability_id" from effects or associate this item with a hero.`;
            setErrors({ _form: [msg] });
            toastError(msg);
            return;
          }
        }
      } else {
        const heroFile = await getFile<{ kit: Array<{ id: string }> }>(`data/${game!}/heroes/${parsed.data.hero}.json`);
        const abilityIds = new Set(heroFile?.content.kit.map(k => k.id) ?? []);
        for (const effect of parsed.data.effects) {
          if (!abilityIds.has(effect.ability_id)) {
            const msg = `Hero "${parsed.data.hero}" has no ability "${effect.ability_id}"`;
            setErrors({ _form: [msg] });
            toastError(msg);
            return;
          }
        }
      }

      const exists = await getFile(`data/${game!}/items/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["An item with this ID already exists"] });
        toastError("An item with this ID already exists.");
        return;
      }

      await createFile(`data/${game!}/items/${parsed.data.id}.json`, parsed.data, `Add item: ${parsed.data.name}`);
      toastSuccess(`Item ${parsed.data.name} created successfully!`);
      navigate(`/${game!}/items`);
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create item: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="space-y-4 bg-white/50 dark:bg-gray-900/30 p-6 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          </div>
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-lg w-32 mt-8"></div>
        </div>
      </div>
    );
  }
  
  if (error) return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load dependencies</h3>
      <p>{String(error)}</p>
    </div>
  );
  
  if (!data) return null;

  if (data.schemaCount === 0) {
    return (
      <div className="w-full py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No Schema Configured</h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">You must create a schema for Items before adding entries.</p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>Create Schema</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Item — {data.game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField name="id" label="Item ID (kebab-case)" placeholder="e.g. aghs-scepter" />
            <FormField name="name" label="Name" placeholder="e.g. Aghanim's Scepter" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="hero" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hero (optional)</label>
                <select id="hero" name="hero"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {data.heroes.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mode (optional)</label>
                <select id="mode" name="mode"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                  <option value="">— Any —</option>
                  {data.modes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {data.fields.map((f) => {
              if (["id", "name", "hero", "mode", "effects", "effects_raw"].includes(f.key)) return null;
              if (f.type === "enum" || f.type === "list") {
                return (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 capitalize mb-1">{f.label}</label>
                    {f.type === "enum" ? (
                      <select name={f.key} required={f.required} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
                        <option value="">— Select {f.label} —</option>
                        {f.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input name={f.key} placeholder={`${f.label} (comma-separated)`} required={f.required} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                    )}
                  </div>
                );
              }
              return (
                <FormField key={f.key} name={f.key} label={f.label} required={f.required} type={f.type === "number" ? "number" : "text"} />
              );
            })}

            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effects (JSON array)</label>
              <textarea
                name="effects_raw"
                rows={8}
                defaultValue={JSON.stringify([{ ability_id: "", override_name: "", override_type: "", override_description: "", params_override: {} }], null, 2)}
                className="block w-full rounded-xl border border-gray-300/50 bg-white/50 px-4 py-3 text-sm font-mono shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-gray-600/50 dark:bg-gray-900/50 dark:text-gray-100 transition-colors"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Each effect can override name, type, description, and params for an ability</p>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/items`)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20">
                {submitting ? "Creating..." : "Create Item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
