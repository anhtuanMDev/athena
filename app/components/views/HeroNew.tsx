
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { HeroSchema, type Hero } from "~/schemas/hero";
import { getFile, createFile, uploadAsset } from "~/lib/github";
import { MultiImageUploadField, type ImageEntry } from "~/components/MultiImageUploadField";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { buildHeroFromFormData, coerceKitParams } from "~/lib/parse-kit";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { useToast } from "~/components/ToastProvider";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { listDirectory } from "~/lib/github";
import { DynamicSelectField } from "~/components/DynamicSelectField";

interface AbilityForm {
  id: string; name: string; type: string; description: string;
  icons: ImageEntry[];
}

export default function NewHero() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const { data, loading, error } = useData(async () => {
    const files = await listDirectory(game!, "schemas");
    const schemas = await Promise.all(
      files.map(async (file) => {
        const content = await getFile<DynamicSchemaFile>(`data/${game}/schemas/${file}`);
        return content?.content;
      })
    );
    const heroSchemas = schemas.filter(s => s && s.category === "hero") as DynamicSchemaFile[];
    const allFields: DynamicField[] = [];
    for (const s of heroSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, game: game! };
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
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Hero — {data.game}</h1>
        </CardHeader>
        <CardContent>
          <HeroForm fields={data.fields} game={data.game} />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroForm({ fields, game }: { fields: DynamicField[]; game: string }) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [abilities, setAbilities] = useState<AbilityForm[]>([]);
  const [portraits, setPortraits] = useState<ImageEntry[]>([]);

  function addAbility() {
    setAbilities([...abilities, { id: "", name: "", type: "", description: "", icons: [] }]);
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
    const nameField = (raw.name as string) || "";
    const id = nameField.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    try {
      if (!id || !/^[a-z0-9-]+$/.test(id)) {
        setErrors({ _form: ["Agent Code Name is required to generate a valid ID"] });
        setSubmitting(false);
        return;
      }
      
      const hero = buildHeroFromFormData(formData, game, id);
      const rawKit = hero.kit;
      // Note: we might need a way to coerce kit params using dynamic fields here too in the future.

      let portraitData: string | Record<string, string> = raw.portrait as string;
      if (portraits.length === 1 && portraits[0].key === "main") {
        const ext = portraits[0].name?.split(".").pop() || "png";
        portraitData = `assets/${game}/heroes/${id}/portrait.${ext}`;
      } else if (portraits.length > 0) {
        portraitData = {};
        for (const p of portraits) {
          const ext = p.name?.split(".").pop() || "png";
          portraitData[p.key] = `assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
        }
      }
      if (portraits.length > 0) {
        hero.portrait = portraitData;
      }

      const abilityUploads: { path: string; base64: string; message: string }[] = [];
      (hero.kit as any[]).forEach((ability, i) => {
        const aIcons = abilities[i]?.icons || [];
        if (aIcons.length === 1 && aIcons[0].key === "main") {
          const ext = aIcons[0].name?.split(".").pop() || "png";
          const path = `assets/${game}/heroes/${id}/abilities/${ability.id}.${ext}`;
          ability.icon = path;
          if (aIcons[0].base64) abilityUploads.push({ path, base64: aIcons[0].base64, message: `Add ${ability.name} icon for ${id}` });
        } else if (aIcons.length > 0) {
          ability.icon = {};
          for (const icon of aIcons) {
            const ext = icon.name?.split(".").pop() || "png";
            const path = `assets/${game}/heroes/${id}/abilities/${ability.id}_${icon.key}.${ext}`;
            ability.icon[icon.key] = path;
            if (icon.base64) abilityUploads.push({ path, base64: icon.base64, message: `Add ${ability.name} ${icon.key} icon for ${id}` });
          }
        }
      });

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

      const uploads = [];
      for (const p of portraits) {
        if (p.base64) {
          const ext = p.name?.split(".").pop() || "png";
          const path = (portraits.length === 1 && p.key === "main")
            ? `assets/${game}/heroes/${id}/portrait.${ext}`
            : `assets/${game}/heroes/${id}/portrait_${p.key}.${ext}`;
          uploads.push(uploadAsset(path, p.base64, undefined, `Add portrait ${p.key} for ${id}`));
        }
      }
      for (const upload of abilityUploads) {
        uploads.push(uploadAsset(upload.path, upload.base64, undefined, upload.message));
      }
      if (uploads.length > 0) await Promise.all(uploads);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField name="name" label="Agent Code Name" placeholder="e.g. Tracer" />
        <FormField name="real_name" label="Real Fullname (optional)" placeholder="e.g. Lena Oxton" required={false} />
      </div>

      {(() => {
        const rolesField = fields.find(f => f.key === "roles");
        return rolesField ? (
          <DynamicSelectField 
            name="roles" 
            label="Roles" 
            options={rolesField.options || []} 
            multiple={rolesField.type === "list"}
            required={rolesField.required}
          />
        ) : (
          <FormField name="roles" label="Roles (comma-separated)" placeholder="e.g. damage" />
        );
      })()}
      <div className="border border-gray-200 dark:border-gray-800 p-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/30">
        <MultiImageUploadField label="Portraits" entries={portraits} onChange={setPortraits} defaultKey="main" />
        {portraits.length === 0 && (
          <div className="mt-4">
            <FormField name="portrait" label="Or Image URL" placeholder="https://..." required={false} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-64">
                  <MultiImageUploadField 
                    label="Icons" 
                    entries={abilities[i].icons}
                    onChange={(newIcons) => {
                      const newAbilities = [...abilities];
                      newAbilities[i].icons = newIcons;
                      setAbilities(newAbilities);
                    }} 
                    defaultKey="main"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <input type="hidden" name={`_kit_${i}_params_keys`} value="" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addAbility}
          className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1">
          + Add Ability
        </button>
      </div>

      <div className="pt-4">
        <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/heroes`)} className="mr-3">Cancel</Button>
        <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20 w-40">
          {submitting ? "Creating..." : "Create Hero"}
        </Button>
      </div>
    </form>
  );
}
