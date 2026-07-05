
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ModeSchema } from "~/schemas/mode";
import { getFile, createFile, listDirectory } from "~/lib/github";
import { type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { useData } from "~/lib/use-data";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";

export default function NewMode() {
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
    const modeSchemas = schemas.filter(s => s && s.category === "mode") as DynamicSchemaFile[];
    const allFields: DynamicField[] = [];
    for (const s of modeSchemas) {
      if (s.fields) allFields.push(...s.fields);
    }
    return { fields: allFields, schemaCount: modeSchemas.length, game: game! };
  }, [game]);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    const nameStr = formData.name as string || "";
    const generatedId = nameStr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    try {
      const parsed = ModeSchema.safeParse({ id: generatedId, ...formData });
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
        toastError("Validation failed. Check your inputs.");
        return;
      }
      const exists = await getFile(`data/${game}/modes/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["A mode with this ID already exists"] });
        toastError("A mode with this ID already exists.");
        return;
      }
      await createFile(`data/${game}/modes/${parsed.data.id}.json`, parsed.data, `Add mode: ${parsed.data.name}`);
      toastSuccess(`Mode ${parsed.data.name} created successfully!`);
      navigate(`/${game}/modes`);
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create mode: ${msg}`);
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
          <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error) return (
    <div className="w-full p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl">
      <h3 className="font-bold text-lg mb-2">Failed to load schema</h3>
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
            <p className="text-sm text-gray-500 mt-2 mb-4">You must create a schema for Modes before adding entries.</p>
            <Button onClick={() => navigate(`/${data.game}/schemas/new`)}>Create Schema</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Mode — {game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <input type="hidden" name="id" value="" />
            <FormField name="name" label="Name" placeholder="e.g. Payload" />
            
            {data.fields.map((f) => {
              if (f.key === "name") return null;
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
            
            <div className="pt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/modes`)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20">
                {submitting ? "Creating..." : "Create Mode"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
