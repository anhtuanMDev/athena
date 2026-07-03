import { useState } from "react";
import { useNavigate } from "react-router";
import { GameSchema } from "~/schemas/game";
import { getFile, updateFile, isConflictError, conflictResponse } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FormField } from "~/components/FormField";

export default function NewGame() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const parsed = GameSchema.safeParse({
        ...formData,
        active: formData.active === "true",
      });

      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      const file = await getFile<{ games: unknown[] }>("data/_meta/games.json");
      if (!file) {
        setErrors({ _form: ["Could not read games.json"] });
        return;
      }

      if (file.content.games.some((g: unknown) => typeof g === "object" && g !== null && (g as Record<string, unknown>).slug === parsed.data.slug)) {
        setErrors({ slug: ["A game with this slug already exists"] });
        return;
      }

      const updated = { games: [...file.content.games, parsed.data] };
      try {
        await updateFile("data/_meta/games.json", updated, file.sha, `Add game: ${parsed.data.name}`);
      } catch (err) {
        if (isConflictError(err)) {
          setErrors({ _form: conflictResponse().errors._form });
          return;
        }
        throw err;
      }
      navigate("/games");
    } catch (err) {
      setErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Add Game</h1>
        </CardHeader>
        <CardContent>
          {errors?._form && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{errors._form.join(", ")}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField name="slug" label="Slug" placeholder="e.g. overwatch" />
            <FormField name="name" label="Name" placeholder="e.g. Overwatch 2" />
            <FormField name="developer" label="Developer" placeholder="e.g. Blizzard Entertainment" required={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" value="true" defaultChecked className="rounded border-gray-300" />
              <span className="text-gray-700 dark:text-gray-300">Active</span>
            </label>
            <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Game"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
