import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { ModeSchema } from "~/schemas/mode";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";
import { useToast } from "~/components/ToastProvider";

export default function NewMode() {
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
    try {
      const parsed = ModeSchema.safeParse({ ...formData });
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
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

  return (
    <div className="max-w-lg mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card>
        <CardHeader><h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">New Mode — {game}</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField name="id" label="Mode ID (kebab-case)" placeholder="e.g. payload" />
            <FormField name="name" label="Name" placeholder="e.g. Payload" />
            <FormField name="description" label="Description" placeholder="Push the payload to the end." required={false} />
            
            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="shadow-lg shadow-violet-500/20 w-full sm:w-auto">
                {submitting ? "Creating..." : "Create Mode"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
