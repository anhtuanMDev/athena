import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { X, Pencil } from "lucide-react";
import { listGames, updateFile, getFile, isConflictError, conflictResponse, uploadAsset } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { FormField } from "~/components/FormField";
import { useData } from "~/lib/use-data";
import { GameSchema } from "~/schemas/game";
import type { Game } from "~/schemas/game";

export default function GamesList() {
  const { data, loading, error } = useData(async () => {
    const games = await listGames();
    return { games };
  }, [], "games-list");

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editOriginalSlug, setEditOriginalSlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(null);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [developer, setDeveloper] = useState("");
  const [icon, setIcon] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#f97316");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [active, setActive] = useState(true);

  function openCreate() {
    setSlug("");
    setName("");
    setDeveloper("");
    setIcon("");
    setIconFile(null);
    setPrimaryColor("#f97316");
    setSecondaryColor("");
    setAccentColor("");
    setActive(true);
    setFormErrors(null);
    setModalMode("create");
  }

  function openEdit(game: Game) {
    setEditOriginalSlug(game.slug);
    setSlug(game.slug);
    setName(game.name);
    setDeveloper(game.developer || "");
    setIcon(game.icon || "");
    setIconFile(null);
    setPrimaryColor(game.primaryColor || (game as any).themeColor || "");
    setSecondaryColor(game.secondaryColor || "");
    setAccentColor(game.accentColor || "");
    setActive(game.active);
    setFormErrors(null);
    setModalMode("edit");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormErrors(null);
    
    try {
      let finalIconUrl = icon;
      
      if (iconFile) {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(iconFile);
        });
        
        const ext = iconFile.name.split('.').pop() || "png";
        const filename = `${slug || 'game'}-icon.${ext}`;
        const path = `public/assets/games/${filename}`;
        
        await uploadAsset(path, base64Data, undefined, `Upload icon for ${name || slug}`);
        finalIconUrl = `/assets/games/${filename}`;
      }

      const parsed = GameSchema.safeParse({
        slug,
        name,
        developer,
        icon: finalIconUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        active,
      });

      if (!parsed.success) {
        setFormErrors(parsed.error.flatten().fieldErrors);
        return;
      }

      const file = await getFile<{ games: Game[] }>("data/_meta/games.json");
      if (!file) {
        setFormErrors({ _form: ["Could not read games.json"] });
        return;
      }

      let updatedGames;
      if (modalMode === "edit") {
        if (parsed.data.slug !== editOriginalSlug && file.content.games.some(g => g.slug === parsed.data.slug)) {
          setFormErrors({ slug: ["A game with this slug already exists"] });
          return;
        }
        updatedGames = file.content.games.map(g => g.slug === editOriginalSlug ? parsed.data : g);
      } else {
        if (file.content.games.some(g => g.slug === parsed.data.slug)) {
          setFormErrors({ slug: ["A game with this slug already exists"] });
          return;
        }
        updatedGames = [...file.content.games, parsed.data];
      }

      try {
        await updateFile("data/_meta/games.json", { games: updatedGames }, file.sha, `${modalMode === "edit" ? "Edit" : "Add"} game: ${parsed.data.name}`);
        setModalMode(null);
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
        <Button onClick={openCreate}>Add Game</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {game.icon ? (
                    <img src={game.icon} alt={game.name} className="w-6 h-6 rounded-md object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-md border border-gray-200 dark:border-gray-800" style={{ backgroundColor: (game as any).primaryColor || (game as any).themeColor || '#f97316' }} />
                  )}
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white" style={{ color: (game as any).primaryColor || (game as any).themeColor }}>{game.name}</h2>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-2">Slug: <code className="text-gray-700 dark:text-gray-300">{game.slug}</code></p>
              {game.developer && <p className="text-sm text-gray-500">{game.developer}</p>}
              <div className="mt-3 flex gap-3">
                <button 
                  onClick={() => openEdit(game)}
                  className="text-sm flex items-center gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalMode(null)} />
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 animate-in slide-in-from-right duration-300">
            <div className="w-screen max-w-md">
              <div className="flex h-full flex-col bg-white dark:bg-[#030712] shadow-2xl border-l border-gray-200 dark:border-gray-800">
                <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    {modalMode === 'edit' ? 'Edit Game' : 'Add Game'}
                  </h1>
                  <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-500 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
                {formErrors?._form && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{formErrors._form.join(", ")}</div>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                  {/* General Info */}
                  <div className="flex flex-col gap-6">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">General Information</h3>
                      <p className="text-xs text-gray-500 mb-4">Core details about the game.</p>
                    </div>
                    <div className="flex flex-col gap-5">
                      <FormField 
                        name="slug" 
                        label="Slug" 
                        placeholder="e.g. overwatch" 
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      />
                      <FormField 
                        name="name" 
                        label="Name" 
                        placeholder="e.g. Overwatch 2" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <FormField 
                        name="developer" 
                        label="Developer" 
                        placeholder="e.g. Blizzard Entertainment" 
                        required={false} 
                        value={developer}
                        onChange={(e) => setDeveloper(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  {/* Branding */}
                  <div className="flex flex-col gap-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Branding & Media</h3>
                      <p className="text-xs text-gray-500 mb-4">Customize how the game appears in the dashboard.</p>
                    </div>
                    
                    <div className="flex flex-col gap-5">
                      <div className="flex gap-4 items-start">
                        <div className="flex-1 flex flex-col gap-3">
                          <FormField 
                            name="icon" 
                            label="Icon URL" 
                            placeholder="https://..." 
                            required={false} 
                            value={icon}
                            onChange={(e) => {
                              setIcon(e.target.value);
                              setIconFile(null);
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 uppercase font-medium">Or</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="text-xs text-gray-500 file:cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-800 dark:file:text-gray-300 cursor-pointer"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setIconFile(file);
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    if (ev.target?.result) {
                                      setIcon(ev.target.result as string);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </div>
                        </div>
                        {icon ? (
                          <div className="w-12 h-12 rounded-md border border-gray-200 dark:border-gray-800 shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center shadow-sm">
                            <img src={icon} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-md border border-dashed border-gray-300 dark:border-gray-700 shrink-0 flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 border border-gray-200 dark:border-gray-800 shadow-sm">
                          <input 
                            type="color" 
                            className="absolute -inset-2 w-14 h-14 cursor-pointer"
                            value={/^#[0-9A-F]{6}$/i.test(primaryColor) ? primaryColor : "#f97316"}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <FormField 
                            name="primaryColor" 
                            label="Primary Color (Hex)" 
                            placeholder="#f97316" 
                            required={false} 
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 border border-gray-200 dark:border-gray-800 shadow-sm">
                          <input 
                            type="color" 
                            className="absolute -inset-2 w-14 h-14 cursor-pointer"
                            value={/^#[0-9A-F]{6}$/i.test(secondaryColor) ? secondaryColor : "#3b82f6"}
                            onChange={(e) => setSecondaryColor(e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <FormField 
                            name="secondaryColor" 
                            label="Secondary Color (Hex)" 
                            placeholder="#3b82f6" 
                            required={false} 
                            value={secondaryColor}
                            onChange={(e) => setSecondaryColor(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 border border-gray-200 dark:border-gray-800 shadow-sm">
                          <input 
                            type="color" 
                            className="absolute -inset-2 w-14 h-14 cursor-pointer"
                            value={/^#[0-9A-F]{6}$/i.test(accentColor) ? accentColor : "#10b981"}
                            onChange={(e) => setAccentColor(e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <FormField 
                            name="accentColor" 
                            label="Accent Color (Hex)" 
                            placeholder="#10b981" 
                            required={false} 
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200 dark:border-gray-800">
                    <label className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors border border-transparent dark:hover:border-gray-800">
                      <input 
                        type="checkbox" 
                        name="active" 
                        value="true" 
                        checked={active} 
                        onChange={(e) => setActive(e.target.checked)} 
                        className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 w-5 h-5 text-orange-600 focus:ring-orange-500" 
                      />
                      <div>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Active Status</span>
                        <span className="block text-xs text-gray-500">Determine if this game is visible across the platform.</span>
                      </div>
                    </label>
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-6 mt-8 border-t border-gray-200 dark:border-gray-800">
                    <Button type="button" variant="ghost" onClick={() => setModalMode(null)}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : (modalMode === 'edit' ? "Save Changes" : "Create Game")}</Button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
