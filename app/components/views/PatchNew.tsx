import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { PatchSchema } from "~/schemas/patch";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";

export default function NewPatch() {
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
    const formData = new FormData(e.currentTarget);
    const changesRaw = formData.get("_changes") as string;
    let changes: Array<{ hero: string; field: string; from?: string; to?: string; note?: string }> = [];
    if (changesRaw) {
      try {
        changes = JSON.parse(changesRaw);
      } catch {
        setErrors({ _form: ["Invalid JSON syntax in Changes field."] });
        toastError("Invalid JSON syntax in Changes field.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const parsed = PatchSchema.safeParse({
        patch: formData.get("patch"),
        date: formData.get("date"),
        summary: formData.get("summary") || undefined,
        changes,
      });

      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        toastError("Validation failed. Check your inputs.");
        return;
      }

      const exists = await getFile(`data/${game}/patches/${parsed.data.patch}.json`);
      if (exists) {
        setErrors({ patch: ["A patch with this ID already exists"] });
        toastError("A patch with this ID already exists.");
        return;
      }

      await createFile(`data/${game}/patches/${parsed.data.patch}.json`, parsed.data, `Add patch: ${parsed.data.patch}`);
      toastSuccess(`Patch ${parsed.data.patch} created successfully!`);
      navigate(`/${game}/patches`);
    } catch (err) {
      const msg = (err as Error).message;
      setErrors({ _form: [msg] });
      toastError(`Failed to create patch: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Patch — {game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField name="patch" label="Patch ID (e.g. 2026.07)" placeholder="2026.07" />
            <FormField name="date" label="Date (ISO)" type="date" />
            <FormField name="summary" label="Summary" placeholder="e.g. Season 3 Balance Update" required={false} />
            <div className="space-y-2 pt-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Changes (JSON array)</label>
              <textarea
                name="_changes"
                rows={5}
                defaultValue={JSON.stringify([{ hero: "", field: "", from: "", to: "", note: "" }], null, 2)}
                className="block w-full rounded-xl border border-gray-300/50 bg-white/50 px-4 py-3 text-sm font-mono shadow-inner focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-gray-600/50 dark:bg-gray-900/50 dark:text-gray-100 transition-colors"
              />
            </div>
            
            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-violet-500/20 w-full sm:w-auto">
                {submitting ? "Creating..." : "Create Patch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
