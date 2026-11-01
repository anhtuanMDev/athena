import { Pencil, X } from "lucide-react";
import { useState } from "react";
import Drawer from "@mui/material/Drawer";
import { FormField } from "~/components/FormField";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  conflictResponse,
  getFile,
  getFileSha,
  isConflictError,
  listGames,
  updateFile,
  uploadAsset,
} from "~/lib/github";
import { useData } from "~/lib/use-data";
import type { Game } from "~/schemas/game";
import { GameSchema } from "~/schemas/game";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { keepUnknownKeys } from "~/lib/unknown-keys";
import {
  LIGHT_BASE,
  MIN_CONTRAST,
  PALETTE_KEYS,
  PALETTE_LABELS,
  colorField,
  contrastWarnings,
  effectivePalette,
  isHex,
  lightFromGame,
  lightToSave,
  type PaletteKey,
} from "~/lib/game-palette";

export default function GamesList() {
  const { data, loading, error } = useData(
    async () => {
      const games = await listGames();
      return { games };
    },
    [],
    "games-list",
  );

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editOriginalSlug, setEditOriginalSlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string[]> | null>(
    null,
  );

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [developer, setDeveloper] = useState("");
  const [icon, setIcon] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [primary, setPrimary] = useState("#6366F1");
  const [secondary, setSecondary] = useState("#8B5CF6");
  const [accent, setAccent] = useState("#EC4899");
  const [background, setBackground] = useState("#F8FAFC");
  const [surface, setSurface] = useState("#FFFFFF");
  const [surfaceVariant, setSurfaceVariant] = useState("#F1F5F9");
  const [onPrimary, setOnPrimary] = useState("#FFFFFF");
  const [onSecondary, setOnSecondary] = useState("#FFFFFF");
  const [onBackground, setOnBackground] = useState("#0F172A");
  const [onSurface, setOnSurface] = useState("#1E293B");
  const [errorColor, setErrorColor] = useState("#EF4444");
  const [warning, setWarning] = useState("#F59E0B");
  const [success, setSuccess] = useState("#10B981");
  const [border, setBorder] = useState("#E2E8F0");
  const [active, setActive] = useState(true);
  const [originalGame, setOriginalGame] = useState<Game | null>(null);
  // The top-level colors are the dark palette, all that older app builds
  // read; `light` holds the light screens' colors, any part of them.
  const [light, setLight] = useState<Partial<Record<PaletteKey, string>>>({});
  const [paletteTab, setPaletteTab] = useState<"dark" | "light">("dark");

  const isValid = slug.trim().length > 0 && name.trim().length > 0;
  const isDirty =
    modalMode === "create"
      ? true
      : originalGame
        ? slug !== originalGame.slug ||
          name !== originalGame.name ||
          developer !== (originalGame.developer || "") ||
          icon !== (originalGame.icon || "") ||
          iconFile !== null ||
          primary !== colorField(originalGame.primary) ||
          secondary !== colorField(originalGame.secondary) ||
          accent !== colorField(originalGame.accent) ||
          background !== colorField(originalGame.background) ||
          surface !== colorField(originalGame.surface) ||
          surfaceVariant !== colorField(originalGame.surfaceVariant) ||
          onPrimary !== colorField(originalGame.onPrimary) ||
          onSecondary !== colorField(originalGame.onSecondary) ||
          onBackground !== colorField(originalGame.onBackground) ||
          onSurface !== colorField(originalGame.onSurface) ||
          errorColor !== colorField(originalGame.error) ||
          warning !== colorField(originalGame.warning) ||
          success !== colorField(originalGame.success) ||
          border !== colorField(originalGame.border) ||
          JSON.stringify(lightToSave(light) ?? {}) !== JSON.stringify(lightToSave(lightFromGame(originalGame.light)) ?? {}) ||
          active !== originalGame.active
        : false;

  const darkPalette: Record<PaletteKey, string> = {
    primary, secondary, accent, background, surface, surfaceVariant, onPrimary,
    onSecondary, onBackground, onSurface, error: errorColor, warning, success, border,
  };
  const setDark: Record<PaletteKey, (value: string) => void> = {
    primary: setPrimary, secondary: setSecondary, accent: setAccent, background: setBackground,
    surface: setSurface, surfaceVariant: setSurfaceVariant, onPrimary: setOnPrimary,
    onSecondary: setOnSecondary, onBackground: setOnBackground, onSurface: setOnSurface,
    error: setErrorColor, warning: setWarning, success: setSuccess, border: setBorder,
  };
  // What the app draws each tab with: empty light colors as the app fills them in.
  const lightFallbacks = effectivePalette(darkPalette, {});
  const warnings = {
    dark: contrastWarnings(effectivePalette(darkPalette)),
    light: contrastWarnings(effectivePalette(darkPalette, light)),
  };
  const paletteRows = PALETTE_KEYS.map((key) =>
    paletteTab === "dark"
      ? { key, value: darkPalette[key], set: setDark[key], fallback: LIGHT_BASE[key] }
      : { key, value: light[key] ?? "", set: (value: string) => setLight((l) => ({ ...l, [key]: value })), fallback: lightFallbacks[key] },
  );

  function openCreate() {
    setSlug("");
    setName("");
    setDeveloper("");
    setIcon("");
    setIconFile(null);
    setPrimary("#6366F1");
    setSecondary("#8B5CF6");
    setAccent("#EC4899");
    setBackground("#F8FAFC");
    setSurface("#FFFFFF");
    setSurfaceVariant("#F1F5F9");
    setOnPrimary("#FFFFFF");
    setOnSecondary("#FFFFFF");
    setOnBackground("#0F172A");
    setOnSurface("#1E293B");
    setErrorColor("#EF4444");
    setWarning("#F59E0B");
    setSuccess("#10B981");
    setBorder("#E2E8F0");
    setLight({});
    setPaletteTab("dark");
    setActive(true);
    setFormErrors(null);
    setOriginalGame(null);
    setModalMode("create");
  }

  function openEdit(game: Game) {
    setEditOriginalSlug(game.slug);
    setSlug(game.slug);
    setName(game.name);
    setDeveloper(game.developer || "");
    setIcon(game.icon || "");
    setIconFile(null);
    setPrimary(colorField(game.primary));
    setSecondary(colorField(game.secondary));
    setAccent(colorField(game.accent));
    setBackground(colorField(game.background));
    setSurface(colorField(game.surface));
    setSurfaceVariant(colorField(game.surfaceVariant));
    setOnPrimary(colorField(game.onPrimary));
    setOnSecondary(colorField(game.onSecondary));
    setOnBackground(colorField(game.onBackground));
    setOnSurface(colorField(game.onSurface));
    setErrorColor(colorField(game.error));
    setWarning(colorField(game.warning));
    setSuccess(colorField(game.success));
    setBorder(colorField(game.border));
    setLight(lightFromGame(game.light));
    setPaletteTab("dark");
    setActive(game.active);
    setFormErrors(null);
    setOriginalGame(game);
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
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(iconFile);
        });

        const ext = iconFile.name.split(".").pop() || "png";
        const filename = `${slug || "game"}-icon.${ext}`;
        const path = `public/assets/games/${filename}`;

        const existingSha = await getFileSha(path);
        await uploadAsset(
          path,
          base64Data,
          existingSha || undefined,
          `Upload icon for ${name || slug}`,
        );
        finalIconUrl = `/api/assets/games/${filename}`;
      }

      const parsed = GameSchema.safeParse({
        slug,
        name,
        developer,
        icon: finalIconUrl,
        primary,
        secondary,
        accent,
        background,
        surface,
        surfaceVariant,
        onPrimary,
        onSecondary,
        onBackground,
        onSurface,
        error: errorColor,
        warning,
        success,
        border,
        light: lightToSave(light),
        active,
      });

      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        // Only form-wide errors show up top; a bad light color is on the other tab.
        if (fieldErrors.light) {
          setPaletteTab("light");
          setFormErrors({ ...fieldErrors, _form: ["A light color isn't a hex color such as #1A2B3C."] });
          return;
        }
        setFormErrors(fieldErrors);
        return;
      }

      const file = await getFile<{ games: Game[] }>("data/_meta/games.json");
      if (!file) {
        setFormErrors({ _form: ["Could not read games.json"] });
        return;
      }

      let updatedGames;
      if (modalMode === "edit") {
        if (
          parsed.data.slug !== editOriginalSlug &&
          file.content.games.some((g) => g.slug === parsed.data.slug)
        ) {
          setFormErrors({ slug: ["A game with this slug already exists"] });
          return;
        }
        // The game's keys this form doesn't edit (a banner…) stay as they are.
        updatedGames = file.content.games.map((g) =>
          g.slug === editOriginalSlug ? (keepUnknownKeys(g, parsed.data, GameSchema) as Game) : g,
        );
      } else {
        if (file.content.games.some((g) => g.slug === parsed.data.slug)) {
          setFormErrors({ slug: ["A game with this slug already exists"] });
          return;
        }
        updatedGames = [...file.content.games, parsed.data];
      }

      try {
        await updateFile(
          "data/_meta/games.json",
          { ...file.content, games: updatedGames },
          file.sha,
          `${modalMode === "edit" ? "Edit" : "Add"} game: ${parsed.data.name}`,
        );
        setModalMode(null);
      } catch (err) {
        if (isConflictError(err)) {
          setFormErrors({ _form: conflictResponse().errors._form });
          return;
        }
        throw err;
      }
    } catch (err) {
      if (isConflictError(err)) {
        setFormErrors({ _form: conflictResponse().errors._form });
      } else {
        setFormErrors({ _form: [(err as Error).message] });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-32 bg-border rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-10 w-24 bg-border rounded animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse motion-reduce:animate-none">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 bg-border rounded-md" />
                    <div className="h-6 w-32 bg-border rounded" />
                  </div>
                  <div className="h-5 w-16 bg-border rounded-full" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-4 w-48 bg-border rounded mb-2" />
                <div className="h-4 w-32 bg-border rounded" />
                <div className="mt-3 h-4 w-12 bg-border rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  if (error) return (
    <LoadErrorState
      title="Failed to Load Games"
      error={error}
      onBack={() => window.history.back()}
    />
  );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">
          Games
        </h1>
        <Button onClick={openCreate}>Add Game</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.games.map((game) => (
          <Card key={game.slug}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {game.icon ? (
                    <div className="h-8 min-w-[32px] px-1.5 bg-white rounded-md flex items-center justify-center shadow-sm ring-1 ring-black/5 shrink-0 overflow-hidden">
                      <img
                        src={game.icon}
                        alt={game.name}
                        className="h-5 w-auto object-contain"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-6 h-6 rounded-md border border-border"
                      style={{
                        backgroundColor: game.primary || "#6366F1",
                      }}
                    />
                  )}
                  <h2 className="text-lg font-semibold text-ink">
                    {game.name}
                  </h2>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${game.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                >
                  {game.active ? "Active" : "Inactive"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink-muted mb-2">
                Slug:{" "}
                <code className="text-ink">
                  {game.slug}
                </code>
              </p>
              {game.developer && (
                <p className="text-sm text-ink-muted">{game.developer}</p>
              )}
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

      <Drawer
        open={modalMode !== null}
        anchor="right"
        onClose={() => setModalMode(null)}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": "game-drawer-title",
            sx: { width: "100%", maxWidth: 448, backgroundColor: "var(--ds-surface)", borderLeft: "1px solid var(--ds-border)" },
          },
        }}
      >
              <div className="flex h-full flex-col">
                <div className="px-6 py-6 border-b border-border flex items-center justify-between">
                  <h2 id="game-drawer-title" className="text-xl font-bold text-ink">
                    {modalMode === "edit" ? "Edit Game" : "Add Game"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    aria-label="Close"
                    className="rounded-lg p-1 text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <X aria-hidden="true" className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
                  {formErrors?._form && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">
                      {formErrors._form.join(", ")}
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                    {/* General Info */}
                    <div className="flex flex-col gap-6">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          General Information
                        </h3>
                        <p className="text-xs text-ink-muted mb-4">
                          Core details about the game.
                        </p>
                      </div>
                      <div className="flex flex-col gap-5">
                        <FormField
                          name="slug"
                          label="Slug"
                          placeholder="e.g. overwatch"
                          value={slug}
                          onChange={(e) =>
                            setSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "-"),
                            )
                          }
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
                    <div className="flex flex-col gap-6 pt-6 border-t border-border">
                      <div>
                        <h3 className="text-sm font-semibold text-ink">
                          Branding & Media
                        </h3>
                        <p className="text-xs text-ink-muted mb-4">
                          Customize how the game appears in the dashboard.
                        </p>
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
                              <span className="text-xs text-ink-muted uppercase font-medium">
                                Or
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="text-xs text-ink-muted file:cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:font-medium file:bg-surface-raised file:text-ink hover:file:bg-gray-200 cursor-pointer"
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
                            <div className="w-12 h-12 rounded-md border border-border shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center shadow-sm">
                              <img
                                src={icon}
                                alt="Preview"
                                className="w-full h-full object-cover"
                                onError={(e) =>
                                  (e.currentTarget.style.display = "none")
                                }
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-md border border-dashed border-border-strong shrink-0 flex items-center justify-center text-ink-muted bg-surface-raised">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect
                                  width="18"
                                  height="18"
                                  x="3"
                                  y="3"
                                  rx="2"
                                  ry="2"
                                />
                                <circle cx="9" cy="9" r="2" />
                                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-4 pt-2">
                          <div role="tablist" aria-label="Palette" className="flex gap-2">
                            {(["dark", "light"] as const).map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={paletteTab === tab}
                                onClick={() => setPaletteTab(tab)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${paletteTab === tab ? "bg-primary-tint text-primary-ink" : "text-ink-muted hover:bg-surface-raised hover:text-ink"}`}
                              >
                                {tab === "dark" ? "Dark" : "Light"}
                                {warnings[tab].length > 0 && <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">· {warnings[tab].length} low contrast</span>}
                              </button>
                            ))}
                          </div>
                          {paletteTab === "dark" && (
                            <p className="text-xs text-ink-muted">Dark screens. Older app builds use these colors on every screen.</p>
                          )}
                          {paletteTab === "light" && (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="flex-1 min-w-48 text-xs text-ink-muted">
                                Light screens. An empty color is what the app uses today, shown greyed.
                              </p>
                              <div className="flex shrink-0 gap-2">
                                <Button type="button" variant="outline" onClick={() => setLight({ ...darkPalette })}>
                                  Start from dark
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => setLight({})}>
                                  Clear
                                </Button>
                              </div>
                            </div>
                          )}
                          {warnings[paletteTab].length > 0 && (
                            <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                              <p className="font-semibold">Hard to read: below {MIN_CONTRAST}:1 (WCAG AA)</p>
                              <ul className="mt-1 list-disc pl-4">
                                {warnings[paletteTab].map(({ text, under, ratio }) => (
                                  <li key={`${text}-${under}`}>
                                    {PALETTE_LABELS[text]} on {PALETTE_LABELS[under]}: {ratio.toFixed(2)}:1
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-1">You can still save. Text in the primary color the app makes readable by itself.</p>
                            </div>
                          )}
                        </div>

                        {paletteRows.map(({ key, value, set, fallback }) => (
                          <div key={`${paletteTab}-${key}`} className="flex gap-4 items-center">
                            <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 border border-border shadow-sm">
                              <input aria-label={`${PALETTE_LABELS[key]} color`}
                                type="color"
                                className="absolute -inset-2 w-14 h-14 cursor-pointer"
                                value={/^#[0-9A-F]{6}$/i.test(value) ? value : fallback}
                                onChange={(e) => set(e.target.value)}
                              />
                            </div>
                            <div className="flex-1">
                              <FormField
                                name={paletteTab === "light" ? `light.${key}` : key}
                                label={`${PALETTE_LABELS[key]} (Hex)`}
                                placeholder={fallback}
                                required={false}
                                value={value}
                                onChange={(e) => set(e.target.value)}
                                error={value.trim() !== "" && !isHex(value)}
                                slotProps={paletteTab === "light" ? { inputLabel: { shrink: true } } : undefined}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-border">
                      <label className="flex items-center gap-3 p-3 -mx-3 rounded-lg hover:bg-surface-raised cursor-pointer transition-colors border border-transparent dark:hover:border-gray-800">
                        <input
                          type="checkbox"
                          name="active"
                          value="true"
                          checked={active}
                          onChange={(e) => setActive(e.target.checked)}
                          className="rounded border-border-strong bg-surface w-5 h-5 text-orange-600 focus:ring-orange-500"
                        />
                        <div>
                          <span className="block text-sm font-medium text-ink">
                            Active Status
                          </span>
                          <span className="block text-xs text-ink-muted">
                            Determine if this game is visible across the
                            platform.
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 mt-8 border-t border-border">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setModalMode(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={submitting || !isValid || !isDirty}
                      >
                        {submitting
                          ? "Saving…"
                          : modalMode === "edit"
                            ? "Save Changes"
                            : "Create Game"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
      </Drawer>
    </div>
  );
}
