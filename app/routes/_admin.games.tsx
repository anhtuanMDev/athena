import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { listGames, updateFile, getFile, isConflictError, conflictResponse } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { GameSchema } from "~/schemas/game";

export default function GamesList() {
  const { data, loading, error } = useData(async () => {
    const games = await listGames();
    return { games };
  });

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors(null);
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const parsed = GameSchema.safeParse({
        ...formData,
        active: formData.active === "true",
      });

      if (!parsed.success) {
        setFormErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      const file = await getFile<{ games: unknown[] }>("data/_meta/games.json");
      if (!file) {
        setFormErrors({ _form: ["Could not read games.json"] });
        return;
      }

      if (file.content.games.some((g: unknown) => typeof g === "object" && g !== null && (g as Record<string, unknown>).slug === parsed.data.slug)) {
        setFormErrors({ slug: ["A game with this slug already exists"] });
        return;
      }

      const updated = { games: [...file.content.games, parsed.data] };
      try {
        await updateFile("data/_meta/games.json", updated, file.sha, `Add game: ${parsed.data.name}`);
        setShowModal(false);
      } catch (err) {
        if (isConflictError(err)) {
          setFormErrors({ _form: conflictResponse().errors._form });
          return;
        }
        throw err;
      }
    } catch (err) {
      setFormErrors({ _form: [(err as Error).message] });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 bg-gray-200 dark:bg-gray-800 rounded-md" />
                  <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
                </div>
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded-full" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="mt-3 h-4 w-12 bg-gray-200 dark:bg-gray-800 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
  if (error) return <div>Error loading games</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Games</h1>
        <Button onClick={() => setShowModal(true)}>Add Game</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {game.icon ? (
                    <img src={game.icon} alt={game.name} className="w-6 h-6 rounded-md object-cover" />
                  ) : null}
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{game.name}</h2>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-2">Slug: <code className="text-gray-700 dark:text-gray-300">{game.slug}</code></p>
              {game.developer && <p className="text-sm text-gray-500">{game.developer}</p>}
              <div className="mt-3">
                <Link to={`/games/${game.slug}/edit`} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">
                  Edit
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <Card>
              <CardHeader>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Add Game</h1>
              </CardHeader>
              <CardContent>
                {formErrors?._form && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{formErrors._form.join(", ")}</div>
                )}
                <form onSubmit={handleCreate} className="space-y-4">
                  <FormField name="slug" label="Slug" placeholder="e.g. overwatch" />
                  <FormField name="name" label="Name" placeholder="e.g. Overwatch 2" />
                  <FormField name="developer" label="Developer" placeholder="e.g. Blizzard Entertainment" required={false} />
                  <FormField name="icon" label="Icon URL" placeholder="https://..." required={false} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" value="true" defaultChecked className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900" />
                    <span className="text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                  
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                    <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Game"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
