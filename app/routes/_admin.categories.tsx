import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PushNotConfigured, usePushConfigured } from "~/components/NotifyPlayers";
import { NotifyTemplateEditor } from "~/components/NotifyTemplateEditor";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { inputClass } from "~/components/layout-editor/PropControl";
import { useToast } from "~/components/ToastProvider";
import { CATEGORIES_PATH, CATEGORY_ICONS, DEFAULT_CATEGORIES, MAX_CATEGORIES, normalizeCategories, type Category } from "~/lib/categories";
import { useReloadCategories } from "~/lib/categories-context";
import { createFile, getDashboardData, getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { allowedFields, notifyTemplateProblems, templateFieldsByCategory } from "~/lib/notify-template";
import { useData } from "~/lib/use-data";

/** Categories whose editors are built in: their name and folder never change. */
const BUILT_IN = ["hero", "map", "mode"];

const blank = (): Category => ({ category: "", folder: "", label: "", singular: "", icon: "list", favoritable: false });

/**
 * The record categories every game has (data/_meta/categories.json): their
 * folders, names and icons, whether players can favorite their records, and
 * the push sent when one is published. A category's name and folder lock once
 * any game has records or schemas in it, and it can't be removed then.
 */
export default function CategoriesPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const reloadCategories = useReloadCategories();
  const { data, loading, error } = useData(
    async () => {
      const [file, dashboard] = await Promise.all([getFile(CATEGORIES_PATH).catch(() => null), getDashboardData()]);
      const schemaCategories = (
        await Promise.all(
          dashboard.games.map((g) => listDirectory<{ category?: string }>(g.slug, "schemas", true, ["category", "fields"]).catch(() => [])),
        )
      ).flat();
      // What each folder and category is used by, across every game.
      const records: Record<string, number> = {};
      for (const g of dashboard.games) for (const [folder, n] of Object.entries(g.counts ?? {})) records[folder] = (records[folder] ?? 0) + n;
      const schemas: Record<string, number> = {};
      for (const s of schemaCategories) if (s?.category) schemas[s.category] = (schemas[s.category] ?? 0) + 1;
      return {
        sha: file?.sha,
        categories: file ? normalizeCategories(file.content).categories : [...DEFAULT_CATEGORIES],
        records,
        schemas,
        // What notification templates may use; the server checks the same on save.
        fields: templateFieldsByCategory(schemaCategories),
        games: dashboard.games,
      };
    },
    [],
    "categories-page",
  );

  const [rows, setRows] = useState<Category[]>([]);
  const [sha, setSha] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [openNotify, setOpenNotify] = useState<number | null>(null);
  const pushConfigured = usePushConfigured();
  useEffect(() => {
    if (data) {
      setRows(data.categories);
      setSha(data.sha);
    }
  }, [data]);

  if (loading) return <div role="status" className="h-8 w-48 rounded bg-border animate-pulse motion-reduce:animate-none" />;
  if (error || !data) return <LoadErrorState title="Failed to load categories" error={error} onBack={() => window.history.back()} />;

  const saved = data.categories;
  const usage = (row: Category) => {
    const original = saved.find((c) => c.category === row.category && c.folder === row.folder);
    if (!original) return { records: 0, schemas: 0 };
    return { records: data.records[original.folder] ?? 0, schemas: data.schemas[original.category] ?? 0 };
  };
  const inUse = (row: Category) => {
    const { records, schemas } = usage(row);
    return records + schemas > 0;
  };
  const locked = (row: Category) => BUILT_IN.includes(row.category) || inUse(row);
  const normalized = normalizeCategories({ categories: rows });
  const problems = [...normalized.problems, ...notifyTemplateProblems(normalized.categories, data.fields)];
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const update = (i: number, change: Partial<Category>) => setRows((list) => list.map((row, j) => (j === i ? { ...row, ...change } : row)));

  async function save() {
    setSaving(true);
    try {
      const content = { categories: rows };
      const newSha = sha
        ? await updateFile(CATEGORIES_PATH, content, sha, "Update categories")
        : await createFile(CATEGORIES_PATH, content, "Add categories");
      setSha(newSha ?? undefined);
      toastSuccess("Categories saved. The app picks them up within a couple of minutes.");
      reloadCategories();
    } catch (err) {
      toastError(isConflictError(err) ? "Someone else changed the categories. Reload the page and try again." : (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Categories</h1>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            The kinds of records every game has. Each gets a list in the sidebar and in the app, and its records live in
            data/&lt;game&gt;/&lt;folder&gt;. A category&apos;s name and folder lock once a game has records or schemas in it.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !dirty || problems.length > 0}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {pushConfigured === false && <PushNotConfigured />}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
            <tr>
              <th scope="col" className="px-2 py-3">Category</th>
              <th scope="col" className="px-2 py-3">Folder</th>
              <th scope="col" className="px-2 py-3">Label</th>
              <th scope="col" className="px-2 py-3">One record</th>
              <th scope="col" className="px-2 py-3">Icon</th>
              <th scope="col" className="px-2 py-3">Favorites</th>
              <th scope="col" className="px-2 py-3">Push</th>
              <th scope="col" className="px-2 py-3">In use</th>
              <th scope="col" className="px-2 py-3"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => {
              const { records, schemas } = usage(row);
              const fixed = locked(row);
              return (
                <tr key={i}>
                  <td className="px-2 py-2">
                    <input aria-label="Category" value={row.category} disabled={fixed} onChange={(e) => update(i, { category: e.target.value })} className={`${inputClass} min-w-24 font-mono disabled:opacity-60`} />
                  </td>
                  <td className="px-2 py-2">
                    <input aria-label="Folder" value={row.folder} disabled={fixed} onChange={(e) => update(i, { folder: e.target.value })} className={`${inputClass} min-w-24 font-mono disabled:opacity-60`} />
                  </td>
                  <td className="px-2 py-2">
                    <input aria-label="Label" value={row.label} onChange={(e) => update(i, { label: e.target.value })} className={`${inputClass} min-w-24`} />
                  </td>
                  <td className="px-2 py-2">
                    <input aria-label="One record" value={row.singular} onChange={(e) => update(i, { singular: e.target.value })} className={`${inputClass} min-w-24`} />
                  </td>
                  <td className="px-2 py-2">
                    <select aria-label="Icon" value={row.icon} onChange={(e) => update(i, { icon: e.target.value as Category["icon"] })} className={`${inputClass} min-w-28`}>
                      {CATEGORY_ICONS.map((icon) => (
                        <option key={icon} value={icon}>{icon}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="checkbox" aria-label={`Players can favorite ${row.label || "these records"}`} checked={row.favoritable} onChange={(e) => update(i, { favoritable: e.target.checked })} className="size-4" />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-expanded={openNotify === i}
                      aria-label={`Push notification for ${row.label || "this category"}`}
                      title={row.notify ? `"Notify players" starts ${row.notify.enabled ? "ticked" : "unticked"}` : "No push notification"}
                      onClick={() => setOpenNotify((open) => (open === i ? null : i))}
                      className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs font-medium text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {row.notify ? (row.notify.enabled ? "On" : "Off") : "None"}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-ink-muted tabular-nums">
                    <span className="block whitespace-nowrap">{records} records</span>
                    <span className="block whitespace-nowrap">{schemas} schemas</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${row.label || "this category"}`}
                      title={fixed ? "Records or schemas use it, or its editor is built in" : undefined}
                      disabled={fixed}
                      onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                      className="rounded-md p-2 text-ink-muted hover:bg-surface-raised hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openNotify !== null && rows[openNotify] && (
        <section aria-labelledby="notify-heading" className="rounded-xl border border-border p-4">
          <h2 id="notify-heading" className="mb-3 text-base font-semibold text-ink">
            Push notification: {rows[openNotify].label || "new category"}
          </h2>
          <NotifyTemplateEditor
            row={rows[openNotify]}
            fields={allowedFields(rows[openNotify].category, data.fields)}
            sampleGame={data.games.find((g) => (g.counts?.[rows[openNotify].folder] ?? 0) > 0)?.slug}
            onChange={(notify) => update(openNotify, { notify })}
          />
        </section>
      )}

      <Button variant="outline" onClick={() => setRows((list) => [...list, blank()])} disabled={rows.length >= MAX_CATEGORIES}>
        <Plus aria-hidden="true" className="size-4" /> Add category
      </Button>
    </div>
  );
}
