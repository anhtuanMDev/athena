import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Dialog from "@mui/material/Dialog";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { inputBaseClass, inputClass } from "~/components/layout-editor/PropControl";
import { createFile, deleteFile, getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { validateNavigationFile } from "~/lib/screen-policy";
import { useData } from "~/lib/use-data";
import {
  CATEGORIES,
  SCREEN_ID,
  SCREEN_TYPES,
  iconOptions,
  normalizeManifest,
  readScreen,
  starterScreens,
  type NavTab,
  type NavigationFile,
  type SchemaInfo,
  type ScreenFile,
  type ScreenType,
} from "~/lib/screen-model";

const APP_SCREENS = [{ id: "app:settings", label: "Settings (built into the app)" }];

const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

export default function ScreensList() {
  const { game } = useParams();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const navPath = `data/${game}/navigation.json`;

  const { data, loading, error } = useData(
    async () => {
      const [names, navFile, schemas, manifestFile] = await Promise.all([
        listDirectory<string>(game!, "screens").catch(() => []),
        getFile<NavigationFile>(navPath).catch(() => null),
        listDirectory<SchemaInfo>(game!, "schemas", true).catch(() => []),
        getFile(`data/_meta/mobile_primitives.json`).catch(() => null),
      ]);
      const files = await Promise.all(
        names.map(async (name) => {
          const file = await getFile<ScreenFile>(`data/${game}/screens/${name}.json`).catch(() => null);
          return file ? { id: name, sha: file.sha, screen: readScreen(file.content) } : null;
        }),
      );
      return {
        screens: files.filter((f): f is NonNullable<typeof f> => f !== null),
        nav: navFile?.content ?? null,
        navSha: navFile?.sha,
        schemas: schemas.filter((s) => s && typeof s === "object" && s.category),
        icons: iconOptions(normalizeManifest(manifestFile?.content)),
      };
    },
    [game],
    `${game}-screens`,
  );

  const [tabs, setTabs] = useState<NavTab[]>([]);
  const [savedTabs, setSavedTabs] = useState("[]");
  const [navSha, setNavSha] = useState<string | undefined>();
  const [savingTabs, setSavingTabs] = useState(false);
  const [newScreen, setNewScreen] = useState<{ id: string; type: ScreenType; title: string; category: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [starterSchema, setStarterSchema] = useState("");
  const [deleting, setDeleting] = useState<{ id: string; sha: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    const initial = Array.isArray(data.nav?.tabs) ? data.nav!.tabs : [];
    setTabs(initial);
    setSavedTabs(JSON.stringify(initial));
    setNavSha(data.navSha);
  }, [data]);

  const screenIds = useMemo(() => (data?.screens ?? []).map((s) => s.id), [data]);
  const tabsDirty = JSON.stringify(tabs) !== savedTabs;
  const tabErrors = useMemo(() => validateNavigationFile({ tabs }, screenIds), [tabs, screenIds]);

  /** Where a screen is opened from: tabs, and actions or tiles on other screens. */
  const referencesTo = (id: string): string[] => {
    const refs = tabs.flatMap((t, i) => (t.screen === id ? [`Tab ${i + 1}${t.label ? ` (${t.label})` : ""}${i === 0 ? ", the Home tab" : ""}`] : []));
    for (const { id: other, screen } of data?.screens ?? []) {
      if (other === id) continue;
      for (const block of screen.blocks) {
        const text = JSON.stringify(block.props);
        if (text.includes(`"screen":"${id}"`)) refs.push(`${screen.title || other}: ${block.type}`);
      }
    }
    return refs;
  };

  if (loading && !data) {
    return (
      <div className="space-y-4 py-8" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-xl bg-border motion-reduce:animate-none" />
      </div>
    );
  }
  if (error || !data) {
    return <LoadErrorState title="Couldn't load app screens" error={error ?? new Error("No data returned.")} onBack={() => window.history.back()} />;
  }

  const saveTabs = async () => {
    setSavingTabs(true);
    const content: NavigationFile = { ...(data.nav ?? {}), tabs: tabs.filter((t) => t.screen && t.label) };
    try {
      const sha = navSha ? await updateFile(navPath, content, navSha, "Update app navigation") : await createFile(navPath, content, "Create app navigation");
      setNavSha(sha ?? navSha);
      setSavedTabs(JSON.stringify(tabs));
      toastSuccess("Tabs saved. The app picks them up on its next config refresh.");
    } catch (err) {
      toastError(isConflictError(err) ? "The tabs changed on GitHub after you opened this page. Reload and try again." : (err as Error).message);
    } finally {
      setSavingTabs(false);
    }
  };

  const createScreen = async () => {
    if (!newScreen) return;
    const id = newScreen.id.trim();
    if (!SCREEN_ID.test(id)) {
      toastError("Use lowercase letters, numbers and dashes for the screen id, e.g. hero-detail.");
      return;
    }
    if (screenIds.includes(id)) {
      toastError(`A screen called "${id}" already exists.`);
      return;
    }
    setCreating(true);
    const file: ScreenFile = {
      type: newScreen.type,
      title: newScreen.title || undefined,
      appearance: newScreen.type === "detail" ? "dark" : "light",
      ...(newScreen.category && (newScreen.type === "list" || newScreen.type === "detail") ? { source: { category: newScreen.category } } : {}),
      blocks: [],
    };
    try {
      await createFile(`data/${game}/screens/${id}.json`, file, `Create screen: ${id}`);
      navigate(`/${game}/screens/${id}`);
    } catch (err) {
      toastError((err as Error).message);
      setCreating(false);
    }
  };

  const createStarters = async () => {
    const schema = data.schemas.find((s) => s.id === starterSchema);
    if (!schema) return;
    const starters = starterScreens(schema).filter((s) => !screenIds.includes(s.id));
    if (starters.length === 0) {
      toastError("Those screens already exist.");
      return;
    }
    setCreating(true);
    try {
      for (const s of starters) await createFile(`data/${game}/screens/${s.id}.json`, s.file, `Create screen: ${s.id}`);
      toastSuccess(`Created ${starters.map((s) => s.id).join(" and ")}. Edit them, then add the list to the tabs or a Quick access block.`);
      setStarterSchema("");
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteFile(`data/${game}/screens/${deleting.id}.json`, deleting.sha, `Delete screen: ${deleting.id}`);
      toastSuccess(`Deleted ${deleting.id}.`);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const moveTab = (i: number, d: -1 | 1) =>
    setTabs((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const patchTab = (i: number, patch: Partial<NavTab>) => setTabs((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const tabTargets = [...screenIds.map((id) => ({ id, label: id })), ...APP_SCREENS];

  return (
    <div className="w-full space-y-10 pb-32 pt-2">
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-prose">
          <h1 className="text-3xl font-bold tracking-tight text-ink">App Screens</h1>
          <p className="mt-2 text-sm text-ink-muted">
            What the mobile app shows for {game}: each screen is a list of blocks bound to your data. Schemas only describe the
            data; nothing appears in the app until a screen uses it.
          </p>
        </div>
        <Button type="button" className="shrink-0 whitespace-nowrap" onClick={() => setNewScreen({ id: "", type: "list", title: "", category: "" })}>
          <Plus aria-hidden="true" className="mr-1.5 size-4" />
          New screen
        </Button>
      </header>

      {newScreen && (
        <section aria-labelledby="new-screen-heading" className="rounded-xl border border-border-strong bg-surface p-5">
          <h2 id="new-screen-heading" className="text-lg font-semibold text-ink">
            New screen
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-xs font-medium text-ink">
              Screen id
              <input autoFocus value={newScreen.id} placeholder="hero-detail" onChange={(e) => setNewScreen({ ...newScreen, id: e.target.value.toLowerCase() })} className={`${inputClass} mt-1.5 font-mono`} />
              <span className="mt-1 block font-normal text-ink-muted">Lowercase letters, numbers and dashes. Home must be “home”.</span>
            </label>
            <label className="block text-xs font-medium text-ink">
              Title
              <input value={newScreen.title} placeholder="Heroes" onChange={(e) => setNewScreen({ ...newScreen, title: e.target.value })} className={`${inputClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-ink">
              Type
              <select value={newScreen.type} onChange={(e) => setNewScreen({ ...newScreen, type: e.target.value as ScreenType })} className={`${inputClass} mt-1.5`}>
                {SCREEN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}: {t.hint}
                  </option>
                ))}
              </select>
            </label>
            {(newScreen.type === "list" || newScreen.type === "detail") && (
              <label className="block text-xs font-medium text-ink">
                Category
                <select value={newScreen.category} onChange={(e) => setNewScreen({ ...newScreen, category: e.target.value })} className={`${inputClass} mt-1.5`}>
                  <option value="">Choose a category…</option>
                  {CATEGORIES.filter((c) => data.schemas.some((s) => s.category === c.category)).map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-5 flex gap-2">
            <Button type="button" onClick={createScreen} disabled={creating || !newScreen.id}>
              {creating ? "Creating…" : "Create and edit"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNewScreen(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="tabs-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="tabs-heading" className="text-lg font-semibold text-ink">
              Tab bar
            </h2>
            <p className="mt-1 max-w-prose text-sm text-ink-muted">
              The first tab is the game's home: swiping left or right on it changes the game. Without tabs, the app shows the
              “home” screen alone.
            </p>
          </div>
          <Button type="button" onClick={saveTabs} disabled={savingTabs || !tabsDirty || tabErrors.length > 0}>
            {savingTabs ? "Saving…" : "Save tabs"}
          </Button>
        </div>
        {tabErrors.length > 0 && (
          <ul aria-live="polite" className="mt-3 space-y-1 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger-ink">
            {tabErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        <ol className="mt-4 space-y-2">
          {tabs.map((tab, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 sm:flex-nowrap">
              <span aria-hidden="true" className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-ink-muted">
                {i + 1}
              </span>
              <input aria-label={`Tab ${i + 1} label`} value={tab.label} placeholder="Label" onChange={(e) => patchTab(i, { label: e.target.value })} className={`${inputBaseClass} min-w-0 flex-1`} />
              <select aria-label={`Tab ${i + 1} icon`} value={tab.icon ?? ""} onChange={(e) => patchTab(i, { icon: e.target.value || undefined })} className={`${inputBaseClass} w-36`}>
                <option value="">No icon</option>
                {data.icons.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
              <select aria-label={`Tab ${i + 1} screen`} value={tab.screen} onChange={(e) => patchTab(i, { screen: e.target.value })} className={`${inputBaseClass} w-56`}>
                {!tabTargets.some((t) => t.id === tab.screen) && <option value={tab.screen}>{tab.screen || "Choose a screen…"} (missing)</option>}
                {tabTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="flex">
                <button type="button" aria-label={`Move tab ${i + 1} up`} disabled={i === 0} onClick={() => moveTab(i, -1)} className={iconButtonClass}>
                  <ArrowUp aria-hidden="true" className="size-4" />
                </button>
                <button type="button" aria-label={`Move tab ${i + 1} down`} disabled={i === tabs.length - 1} onClick={() => moveTab(i, 1)} className={iconButtonClass}>
                  <ArrowDown aria-hidden="true" className="size-4" />
                </button>
                <button type="button" aria-label={`Remove tab ${i + 1}`} onClick={() => setTabs((prev) => prev.filter((_, j) => j !== i))} className={iconButtonClass}>
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setTabs((prev) => [...prev, { label: "", icon: data.icons[0], screen: screenIds.includes("home") && prev.length === 0 ? "home" : screenIds[0] ?? "" }])}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add tab
        </button>
      </section>

      <section aria-labelledby="screens-heading">
        <h2 id="screens-heading" className="text-lg font-semibold text-ink">
          Screens
        </h2>
        {data.screens.length === 0 ? (
          <p className="mt-3 max-w-prose rounded-xl border border-dashed border-border-strong p-6 text-sm text-ink-muted">
            No screens yet, so the app shows “not set up” for this game. Create a screen called “home”, or start from a schema below.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-raised text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Screen</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Shows</th>
                  <th scope="col" className="px-4 py-3">Blocks</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {data.screens.map(({ id, sha, screen }) => (
                  <tr key={id} className="transition-colors hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <Link to={`/${game}/screens/${id}`} className="rounded font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                        {screen.title || id}
                      </Link>
                      <span className="block font-mono text-xs text-ink-muted">{id}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {SCREEN_TYPES.find((t) => t.value === screen.type)?.label} · {screen.appearance === "dark" ? "dark" : "light"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{screen.source ? CATEGORIES.find((c) => c.category === screen.source?.category)?.label ?? screen.source.category : "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-muted">{screen.blocks.length}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" aria-label={`Delete ${id}`} onClick={() => setDeleting({ id, sha })} className={iconButtonClass}>
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="starter-heading" className="rounded-xl border border-border bg-surface p-5">
        <h2 id="starter-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Sparkles aria-hidden="true" className="size-4" />
          Start from a schema
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Creates a list screen and a detail screen with the schema's main fields as a starting point. They are ordinary screens
          afterwards: edit them like any other.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <select aria-label="Schema" value={starterSchema} onChange={(e) => setStarterSchema(e.target.value)} className={`${inputBaseClass} w-auto min-w-56`}>
            <option value="">Choose a schema…</option>
            {data.schemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.category})
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={createStarters} disabled={!starterSchema || creating}>
            {creating ? "Creating…" : "Create starter screens"}
          </Button>
        </div>
      </section>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        aria-labelledby="delete-screen-title"
        slotProps={{ paper: { sx: { width: "100%", maxWidth: 420, m: 2, borderRadius: "16px", border: "1px solid var(--ds-border)" } } }}
      >
        <div className="p-6">
          <h2 id="delete-screen-title" className="text-lg font-semibold text-ink">
            Delete {deleting?.id}?
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            The app stops showing it, and tabs or buttons that open it do nothing. This removes the file from GitHub.
          </p>
          {deleting && referencesTo(deleting.id).length > 0 && (
            <div className="mt-3 rounded-lg bg-surface-raised p-3 text-sm text-ink">
              <p className="font-medium">Still opened from:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
                {referencesTo(deleting.id).map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" autoFocus onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete screen
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
