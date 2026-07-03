import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { GameSchema } from "~/schemas/game";
import { listGames, getFile, updateFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";

export default function EditGame() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const { data: game, loading, error: loadError } = useData(async () => {
    const games = await listGames();
    const found = games.find((g) => g.slug === slug);
    if (!found) throw new Error("Game not found");
    return found;
  }, [slug]);

  const [errors, setErrors] = useState<Record<string, string[]> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors(null);
    setSubmitError(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = GameSchema.safeParse({
      ...formData,
      active: formData.active === "true",
    });

    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      return;
    }

    const file = await getFile<{ games: Array<Record<string, unknown>> }>("data/_meta/games.json");
    if (!file) {
      setSubmitError("Could not read games.json");
      return;
    }

    const updated = {
      games: file.content.games.map((g) =>
        g.slug === slug ? { ...parsed.data } : g
      ),
    };

    try {
      await updateFile("data/_meta/games.json", updated, file.sha, `Update game: ${parsed.data.name}`);
      navigate("/games");
    } catch (err) {
      if (isConflictError(err)) {
        setSubmitError("Conflict: file was modified since loading. Refresh and re-apply.");
      } else {
        throw err;
      }
    }
  }

  if (loading) return <div>Loading...</div>;
  if (loadError) return <div>Error: {(loadError as Error).message}</div>;
  if (!game) return null;

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Edit Game</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="slug" value={game.slug} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
              <p className="text-sm text-gray-500">{game.slug}</p>
            </div>
            <FormField name="name" label="Name" defaultValue={game.name} />
            <FormField name="developer" label="Developer" defaultValue={game.developer ?? ""} required={false} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" value="true" defaultChecked={game.active} className="rounded border-gray-300" />
              <span className="text-gray-700 dark:text-gray-300">Active</span>
            </label>
            {errors && (
              <div className="text-sm text-red-500">
                {Object.entries(errors).map(([key, msgs]) => (
                  <p key={key}>{key}: {msgs.join(", ")}</p>
                ))}
              </div>
            )}
            {submitError && <p className="text-sm text-red-500">{submitError}</p>}
            <div className="flex gap-2">
              <Button type="submit">Save Changes</Button>
              <a href="/games" className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
