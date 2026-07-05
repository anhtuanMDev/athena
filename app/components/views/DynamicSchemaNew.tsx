
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { DynamicSchemaFileSchema } from "~/schemas/dynamic-schema";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";

export default function DynamicSchemaNew() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    
    // Auto-generate ID from name
    const nameStr = formData.name as string || "";
    const categoryStr = formData.category as string || "";
    const generatedId = `${categoryStr}-${nameStr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

    try {
      const parsed = DynamicSchemaFileSchema.safeParse({
        id: generatedId,
        name: nameStr,
        category: categoryStr,
        fields: [], // Start with empty fields
      });
      
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        toastError("Validation failed. Check your inputs.");
        return;
      }
      
      const exists = await getFile(`data/${game}/schemas/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ name: ["A schema with this name/category already exists"] });
        toastError("A schema with this ID already exists.");
        return;
      }
      
      await createFile(`data/${game}/schemas/${parsed.data.id}.json`, parsed.data, `Add schema: ${parsed.data.name}`);
      toastSuccess(`Schema ${parsed.data.name} created successfully!`);
      navigate(`/${game}/schemas/${parsed.data.id}`); // navigate to edit mode to add fields
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create schema: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full py-8">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Schema — {game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField name="name" label="Schema Name" placeholder="e.g. Base Hero Attributes" />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
              <select 
                name="category" 
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="hero">Hero</option>
                <option value="map">Map</option>
                <option value="mode">Mode</option>
                <option value="patch">Patch</option>
                <option value="event">Event</option>
                <option value="item">Item</option>
              </select>
              {errors?.category && <p className="mt-1 text-sm text-red-500">{errors.category.join(", ")}</p>}
            </div>
            
            <div className="pt-4 flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/schemas`)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-orange-500/20">
                {submitting ? "Creating..." : "Create & Add Fields"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
