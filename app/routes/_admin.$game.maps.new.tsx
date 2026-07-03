import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { MapSchema } from "~/schemas/map";
import { getFile, createFile } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { FormField } from "~/components/FormField";

export default function NewMap() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const parsed = MapSchema.safeParse({
        ...formData,
        game,
        game_modes: (formData.game_modes as string || "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      const exists = await getFile(`data/${game}/maps/${parsed.data.id}.json`);
      if (exists) {
        setErrors({ id: ["A map with this ID already exists"] });
        return;
      }
      await createFile(`data/${game}/maps/${parsed.data.id}.json`, parsed.data, `Add map: ${parsed.data.name}`);
      navigate(`/${game}/maps`);
    } catch (err) {
      setErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader><h1 className="text-xl font-bold">New Map</h1></CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField name="id" label="Map ID (kebab-case)" />
            <FormField name="name" label="Name" />
            <FormField name="game_modes" label="Game Modes (comma-separated)" required={false} />
            <FormField name="location" label="Location" required={false} />
            <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Map"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
