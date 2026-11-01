import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useBlocker, useParams } from "react-router";
import Dialog from "@mui/material/Dialog";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { BlockPreview, type PreviewContext } from "~/components/layout-editor/BlockPreview";
import { PropControl, inputBaseClass, inputClass, type PropContext } from "~/components/layout-editor/PropControl";
import { getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { validateScreenFile } from "~/lib/screen-policy";
import { useData } from "~/lib/use-data";
import { useCategories } from "~/lib/categories-context";
import {
  SCREEN_TYPES,
  bindingPath,
  createBlock,
  folderFor,
  formProps,
  homeFields,
  iconOptions,
  isBinding,
  itemFieldsFor,
  normalizeManifest,
  readScreen,
  recordLabel,
  sourceFields,
  validateScreen,
  type FieldOption,
  type PrimitiveManifest,
  type RecordSource,
  type SchemaInfo,
  type ScreenBlock,
  type ScreenFile,
  type ScreenIssue,
} from "~/lib/screen-model";

interface EnumFile {
  id: string;
  options?: (string | { id?: string; name?: string })[];
}

const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

// The preview shows the screen in its own appearance, whatever the admin's theme is.
const PREVIEW_PALETTES: Record<"light" | "dark", CSSProperties> = {
  light: {
    "--ds-page": "oklch(98.5% 0.002 247.839)",
    "--ds-surface": "oklch(100% 0 0)",
    "--ds-surface-raised": "oklch(96.7% 0.003 264.542)",
    "--ds-border": "oklch(92.8% 0.006 264.531)",
    "--ds-border-strong": "oklch(87.2% 0.01 258.338)",
    "--ds-ink": "oklch(21% 0.034 264.665)",
    "--ds-ink-muted": "oklch(55.1% 0.027 264.364)",
  } as CSSProperties,
  dark: {
    "--ds-page": "oklch(13% 0.028 261.692)",
    "--ds-surface": "oklch(21% 0.034 264.665)",
    "--ds-surface-raised": "oklch(27.8% 0.033 256.848)",
    "--ds-border": "oklch(27.8% 0.033 256.848)",
    "--ds-border-strong": "oklch(37.3% 0.034 259.733)",
    "--ds-ink": "oklch(98.5% 0.002 247.839)",
    "--ds-ink-muted": "oklch(70.7% 0.022 261.325)",
  } as CSSProperties,
};

function summarizeProps(block: ScreenBlock): string {
  const parts = Object.entries(block.props)
    .filter(([, value]) => value !== undefined && (typeof value !== "object" || Array.isArray(value) || isBinding(value)))
    .slice(0, 3)
    .map(([name, value]) => {
      if (isBinding(value)) return `${name} ← ${value}`;
      if (Array.isArray(value)) return `${name}: ${value.length} ${value.length === 1 ? "entry" : "entries"}`;
      const text = typeof value === "string" ? `"${value}"` : JSON.stringify(value);
      return `${name}: ${text.length > 24 ? `${text.slice(0, 23)}…` : text}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "No props set";
}

function tabsOf(screen: ScreenFile): string[] {
  const bar = screen.blocks.find((b) => b.type === "tab_bar" && b.visible !== false);
  return typeof bar?.props.tabs === "string" ? bar.props.tabs.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

function sortRecords(records: Record<string, unknown>[], source: RecordSource | undefined): Record<string, unknown>[] {
  if (!source) return records;
  let result = source.schema ? records.filter((r) => (r.schema_id ?? source.schema) === source.schema) : records;
  if (source.sort) {
    const key = source.sort;
    const dir = source.order === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => dir * String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { numeric: true }));
  }
  return source.limit ? result.slice(0, source.limit) : result;
}

export default function ScreenEdit() {
  const { game, "*": splat } = useParams();
  const configured = useCategories();
  const folders = configured.map((c) => c.folder).join();
  const id = splat?.split("/")[1] ?? "";
  const screenPath = `data/${game}/screens/${id}.json`;
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaded, loading, error: loadError } = useData(
    async () => {
      const [file, schemas, enums, screenNames, manifestFile] = await Promise.all([
        getFile<ScreenFile>(screenPath),
        listDirectory<SchemaInfo>(game!, "schemas", true).catch(() => []),
        listDirectory<EnumFile>(game!, "enums", true).catch(() => []),
        listDirectory<string>(game!, "screens").catch(() => []),
        getFile(`data/_meta/mobile_primitives.json`).catch(() => null),
      ]);
      if (!file) throw new Error(`Screen "${id}" was not found in data/${game}/screens.`);
      const categories = [...new Set(schemas.map((s) => s.category))];
      const recordLists = await Promise.all(
        categories.map(async (category) => {
          const folder = folderFor(category, configured);
          const records = folder ? await listDirectory<Record<string, unknown>>(game!, folder, true).catch(() => []) : [];
          return [category, Array.isArray(records) ? records : []] as const;
        }),
      );
      return {
        file: file.content,
        sha: file.sha,
        schemas: schemas.filter((s) => s && typeof s === "object" && s.category),
        enums,
        screenIds: screenNames.filter((n) => typeof n === "string"),
        manifest: normalizeManifest(manifestFile?.content),
        records: Object.fromEntries(recordLists) as Record<string, Record<string, unknown>[]>,
      };
    },
    [game, id, folders],
    `${game}-screen-${id}-${folders}`,
  );

  const [screen, setScreen] = useState<ScreenFile | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [sha, setSha] = useState<string | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"blocks" | "preview">("blocks");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [previewTab, setPreviewTab] = useState<string | undefined>();
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const issuesHeadingRef = useRef<HTMLHeadingElement>(null);

  const snapshot = screen ? JSON.stringify(screen) : null;
  const dirty = saved !== null && snapshot !== saved;

  // Take the file on first load and after our own saves; a refetch that lands
  // while edits are unsaved is ignored, so a stale sha surfaces as a conflict.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!loaded || dirtyRef.current) return;
    const next = readScreen(loaded.file);
    setScreen(next);
    setSaved(JSON.stringify(next));
    setSha(loaded.sha);
  }, [loaded]);

  const manifest: PrimitiveManifest | null = loaded?.manifest ?? null;
  const schemas = loaded?.schemas ?? [];
  const icons = useMemo(() => iconOptions(manifest), [manifest]);
  const recordsFor = useCallback(
    (source: RecordSource | undefined) => sortRecords(source ? loaded?.records[source.category] ?? [] : [], source),
    [loaded],
  );

  const detailRecords = screen?.type === "detail" && screen.source ? loaded?.records[screen.source.category] ?? [] : [];
  const sample = detailRecords[Math.min(sampleIndex, detailRecords.length - 1)] ?? null;

  const dataFields: FieldOption[] = useMemo(() => {
    if (!screen) return [];
    if (screen.type === "detail") return sourceFields(schemas, screen.source, detailRecords);
    const fields = homeFields(configured);
    return screen.source ? [...sourceFields(schemas, screen.source), ...fields] : fields;
  }, [screen, schemas, detailRecords, configured]);

  const homeData = useMemo(() => {
    const data: Record<string, unknown> = { game: { name: game } };
    for (const c of configured) data[c.folder] = loaded?.records[c.category] ?? [];
    return data;
  }, [loaded, game, configured]);

  const enumOptions = useCallback(
    (field: FieldOption | undefined) => {
      if (!field) return [];
      if (field.globalEnumId) {
        const file = loaded?.enums.find((e) => e.id === field.globalEnumId);
        return (file?.options ?? []).flatMap((o) =>
          typeof o === "string" ? [{ id: o, name: o }] : o.id || o.name ? [{ id: String(o.id ?? o.name), name: String(o.name ?? o.id) }] : [],
        );
      }
      return (field.options ?? []).map((o) => ({ id: o, name: o }));
    },
    [loaded],
  );

  const recordsOf = useCallback((category: string) => loaded?.records[category] ?? [], [loaded]);
  const issues = useMemo(
    () => (screen ? validateScreen(screen, manifest, dataFields, schemas, loaded?.screenIds ?? [], recordsOf) : []),
    [screen, manifest, dataFields, schemas, loaded, recordsOf],
  );
  const visibleIssues = (list: ScreenIssue[]) => list.filter((i) => attemptedSave || i.kind !== "required");
  const jsonErrorList = Object.entries(jsonErrors);
  // The same structural check the write API runs, so a save never fails there unexpectedly.
  const fileErrors = useMemo(() => (screen ? validateScreenFile(screen) : []), [screen]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  // File errors mostly repeat the editor's own checks: list and count them only when those pass.
  const listedFileErrors = errorCount > 0 ? [] : fileErrors;
  const blockingCount = errorCount + jsonErrorList.length + listedFileErrors.length;

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const el = document.getElementById(pendingFocus.current) as HTMLElement | null;
    pendingFocus.current = null;
    el?.focus();
  });

  const update = (patch: Partial<ScreenFile>) => setScreen((prev) => (prev ? { ...prev, ...patch } : prev));
  const setBlocks = (fn: (blocks: ScreenBlock[]) => ScreenBlock[]) =>
    setScreen((prev) => (prev ? { ...prev, blocks: fn(prev.blocks) } : prev));
  const blocks = screen?.blocks ?? [];
  const nameOf = (block: ScreenBlock) => manifest?.[block.type]?.name ?? block.type;

  const addBlock = (type: string) => {
    const block = createBlock(type);
    setBlocks((current) => [...current, block]);
    setExpandedId(block.id);
    setPickerOpen(false);
    pendingFocus.current = `block-${block.id}-toggle`;
    setAnnouncement(`Added ${manifest?.[type]?.name ?? type} as block ${blocks.length + 1}.`);
  };

  const moveBlock = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const block = blocks[index];
    setBlocks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    const edge = target === 0 || target === blocks.length - 1;
    pendingFocus.current = `block-${block.id}-${edge ? (delta < 0 ? "down" : "up") : delta < 0 ? "up" : "down"}`;
    setAnnouncement(`Moved ${nameOf(block)} to position ${target + 1} of ${blocks.length}.`);
  };

  const patchBlock = (blockId: string, patch: Partial<ScreenBlock>) =>
    setBlocks((current) => current.map((b) => (b.id === blockId ? { ...b, ...patch } : b)));

  const updateProp = (blockId: string, name: string, value: unknown) =>
    setBlocks((current) =>
      current.map((b) => {
        if (b.id !== blockId) return b;
        const props = { ...b.props };
        if (value === undefined) delete props[name];
        else props[name] = value;
        return { ...b, props };
      }),
    );

  /** Drops props the app won't take (styles, callbacks, props the block doesn't have). */
  const removeProps = (blockId: string, names: string[]) =>
    setBlocks((current) =>
      current.map((b) => (b.id === blockId ? { ...b, props: Object.fromEntries(Object.entries(b.props).filter(([n]) => !names.includes(n))) } : b)),
    );

  const duplicateBlock = (index: number) => {
    const original = blocks[index];
    const copy = { ...createBlock(original.type), props: structuredClone(original.props), visible: original.visible, tab: original.tab };
    setBlocks((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setExpandedId(copy.id);
    pendingFocus.current = `block-${copy.id}-toggle`;
    setAnnouncement(`Duplicated ${nameOf(original)} as block ${index + 2}.`);
  };

  const removeBlock = (index: number) => {
    const block = blocks[index];
    setBlocks((current) => current.filter((b) => b.id !== block.id));
    setJsonErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${block.id}:`))));
    const neighbour = blocks[index + 1] ?? blocks[index - 1];
    pendingFocus.current = neighbour ? `block-${neighbour.id}-toggle` : "add-block-button";
    setAnnouncement(`Removed ${nameOf(block)}.`);
  };

  const reportJson = (key: string) => (error: string | null) =>
    setJsonErrors((prev) => {
      if (error === null) {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return prev[key] === error ? prev : { ...prev, [key]: error };
    });

  const revealBlock = (blockId: string) => {
    if (!blockId) {
      setSettingsOpen(true);
      return;
    }
    setExpandedId(blockId);
    setMobilePane("blocks");
    pendingFocus.current = `block-${blockId}-toggle`;
    requestAnimationFrame(() => document.getElementById(`block-${blockId}`)?.scrollIntoView({ block: "nearest" }));
  };

  const save = async () => {
    if (!loaded || !screen || submitting || !dirty) return;
    setAttemptedSave(true);
    if (blockingCount > 0) {
      requestAnimationFrame(() => issuesHeadingRef.current?.focus());
      return;
    }
    setSubmitting(true);
    const { id: _id, ...rest } = { ...(loaded.file as Record<string, unknown>), ...screen } as Record<string, unknown>;
    const content = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const savedSnapshot = JSON.stringify(screen);
    try {
      const newSha = await updateFile(screenPath, content, sha!, `Update screen: ${id}`);
      if (newSha) setSha(newSha);
      setSaved(savedSnapshot);
      setAttemptedSave(false);
      toastSuccess("Screen saved. The app picks it up on its next config refresh.");
    } catch (err) {
      toastError(
        isConflictError(err)
          ? "This screen changed on GitHub after you opened it. Reload the page to get the latest version, then redo your changes."
          : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading && !loaded) {
    return (
      <div className="w-full space-y-6 py-8" aria-busy="true">
        <div className="h-4 w-28 rounded bg-border" />
        <div className="h-9 w-80 max-w-full animate-pulse rounded-lg bg-border motion-reduce:animate-none" />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_375px]">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-border motion-reduce:animate-none" />
            ))}
          </div>
          <div className="hidden h-[640px] animate-pulse rounded-2xl bg-border motion-reduce:animate-none xl:block" />
        </div>
      </div>
    );
  }

  if (loadError || !loaded || !screen) {
    return (
      <LoadErrorState
        title="Couldn't load this screen"
        error={loadError ?? new Error("No data returned.")}
        onBack={() => window.history.back()}
      />
    );
  }

  const tabs = tabsOf(screen);
  const activePreviewTab = previewTab && tabs.includes(previewTab) ? previewTab : tabs[0];
  const previewBlocks = blocks.filter((b) => b.visible !== false && (!b.tab || !activePreviewTab || b.tab === activePreviewTab));
  const hiddenCount = blocks.filter((b) => b.visible === false).length;
  const previewCtx: PreviewContext = {
    data: screen.type === "detail" ? sample : homeData,
    recordsFor,
    enumOptions,
    dataFields,
    screenSource: screen.source,
  };
  const summaryIssues = visibleIssues(issues).filter((i) => i.level === "error");
  const screenIssues = visibleIssues(issues).filter((i) => !i.sectionId);
  const categoriesWithSchemas = configured.filter((c) => schemas.some((s) => s.category === c.category));

  return (
    <div className="w-full pb-32 pt-2">
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link
            to={`/${game}/screens`}
            className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            App screens
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-balance text-ink">Screen: {screen.title || id}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span className="font-mono text-xs">{screenPath}</span>
            <span aria-live="polite" className="inline-flex items-center gap-1.5">
              {dirty ? (
                <>
                  <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                  Unsaved changes
                </>
              ) : (
                "Saved"
              )}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-xs text-ink-muted lg:inline">
            <kbd className="font-sans">⌘S</kbd> to save
          </span>
          <Button type="button" onClick={save} disabled={submitting || !dirty}>
            {submitting ? "Saving…" : "Save screen"}
          </Button>
        </div>
      </header>

      {!manifest && (
        <div role="note" className="mt-6 flex gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm text-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-mono text-xs">data/_meta/mobile_primitives.json</span> couldn't be loaded, so blocks can't
            be checked against the app. Props can still be edited as JSON.
          </p>
        </div>
      )}

      {attemptedSave && blockingCount > 0 && (
        <section aria-labelledby="screen-issues-heading" className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-4">
          <h2 id="screen-issues-heading" ref={issuesHeadingRef} tabIndex={-1} className="text-sm font-semibold text-ink focus:outline-none">
            Fix {blockingCount === 1 ? "1 problem" : `${blockingCount} problems`} before saving
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {summaryIssues.map((issue, i) => {
              const block = blocks.find((b) => b.id === issue.sectionId);
              return (
                <li key={`${issue.sectionId}-${issue.prop ?? i}`}>
                  <button
                    type="button"
                    onClick={() => revealBlock(issue.sectionId)}
                    className="rounded text-left text-danger-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {block ? nameOf(block) : "Screen settings"}: {issue.message}
                  </button>
                </li>
              );
            })}
            {listedFileErrors.map((message) => (
              <li key={message} className="text-danger-ink">
                {message}
              </li>
            ))}
            {jsonErrorList.map(([key, message]) => {
              const [blockId, prop] = key.split(":");
              const block = blocks.find((b) => b.id === blockId);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => revealBlock(blockId)}
                    className="rounded text-left text-danger-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {block ? nameOf(block) : blockId}, {prop}: {message}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-6 flex justify-end xl:hidden">
        <div role="group" aria-label="Show" className="inline-flex rounded-lg bg-surface-raised p-1">
          {(["blocks", "preview"] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              aria-pressed={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                mobilePane === pane ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {pane === "blocks" ? "Blocks" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 items-start gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_375px]">
        <section aria-labelledby="blocks-heading" className={mobilePane === "preview" ? "hidden xl:block" : ""}>
          {/* Screen settings */}
          <div className={`mb-4 rounded-xl border bg-surface ${settingsOpen ? "border-border-strong" : "border-border"}`}>
            <button
              type="button"
              aria-expanded={settingsOpen}
              aria-controls="screen-settings"
              onClick={() => setSettingsOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <ChevronDown aria-hidden="true" className={`size-4 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${settingsOpen ? "" : "-rotate-90"}`} />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">Screen settings</span>
                <span className="block text-xs text-ink-muted">
                  {SCREEN_TYPES.find((t) => t.value === screen.type)?.label} · {screen.appearance === "dark" ? "Dark" : "Light"}
                  {screen.source ? ` · ${configured.find((c) => c.category === screen.source?.category)?.label ?? screen.source.category}` : ""}
                </span>
              </span>
              {screenIssues.length > 0 && (
                <span className="rounded-full bg-danger/10 px-1.5 text-xs font-medium text-danger-ink">{screenIssues.length}</span>
              )}
            </button>
            <div id="screen-settings" hidden={!settingsOpen} className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
              {settingsOpen && (
                <>
                  <label className="block text-xs font-medium text-ink">
                    Title
                    <input value={screen.title ?? ""} onChange={(e) => update({ title: e.target.value || undefined })} className={`${inputClass} mt-1.5`} />
                  </label>
                  <label className="block text-xs font-medium text-ink">
                    Type
                    <select value={screen.type} onChange={(e) => update({ type: e.target.value as ScreenFile["type"] })} className={`${inputClass} mt-1.5`}>
                      {SCREEN_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}: {t.hint}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="text-xs font-medium text-ink">
                    Appearance
                    <div role="group" aria-label="Appearance" className="mt-1.5 inline-flex rounded-lg bg-surface-raised p-1">
                      {(["light", "dark"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={screen.appearance === a}
                          onClick={() => update({ appearance: a })}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                            screen.appearance === a ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(screen.type === "list" || screen.type === "detail") && (
                    <label className="block text-xs font-medium text-ink">
                      {screen.type === "list" ? "Records listed" : "Record shown"}
                      <select
                        value={screen.source?.category ?? ""}
                        onChange={(e) =>
                          update({ source: e.target.value ? { ...(screen.source ?? {}), category: e.target.value, schema: undefined } : undefined })
                        }
                        className={`${inputClass} mt-1.5`}
                        aria-invalid={screenIssues.length > 0 ? true : undefined}
                      >
                        <option value="">Choose a category…</option>
                        {categoriesWithSchemas.map((c) => (
                          <option key={c.category} value={c.category}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {screen.type === "detail" && (
                    <label className="block text-xs font-medium text-ink md:col-span-2">
                      Accent color
                      <input
                        value={screen.accent ?? ""}
                        placeholder="#FF8200, or data.color for a per-record color"
                        onChange={(e) => update({ accent: e.target.value || undefined })}
                        className={`${inputClass} mt-1.5 font-mono`}
                      />
                    </label>
                  )}
                  {screenIssues.map((i) => (
                    <p key={i.message} className="text-xs text-danger-ink md:col-span-2">
                      {i.message}
                    </p>
                  ))}
                </>
              )}
            </div>
          </div>

          <h2 id="blocks-heading" className="sr-only">
            Blocks
          </h2>

          {blocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-6 py-8">
              <p className="text-sm font-semibold text-ink">No blocks on this screen yet</p>
              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                Blocks render top to bottom. Add one, then bind its props to fields or type a fixed value.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {blocks.map((block, index) => {
                const spec = manifest?.[block.type];
                const expanded = expandedId === block.id;
                const blockIssues = visibleIssues(issues.filter((i) => i.sectionId === block.id));
                const blockJsonErrors = jsonErrorList.filter(([key]) => key.startsWith(`${block.id}:`)).length;
                const errorCount = blockIssues.filter((i) => i.level === "error").length + blockJsonErrors;
                const warnings = blockIssues.filter((i) => i.level === "warning" && !i.prop);
                const hidden = block.visible === false;
                const bodyId = `block-${block.id}-body`;
                const name = nameOf(block);
                const formNames = new Set(formProps(spec).map(([n]) => n));
                // Issues that no prop field shows: block-wide ones, and props outside the form.
                const blockNotes = blockIssues.filter((i) => !i.prop || !formNames.has(i.prop));
                const strayProps = Object.keys(block.props).filter((n) => spec && !formNames.has(n));
                const context: PropContext = {
                  dataFields,
                  itemFields: spec?.list ? itemFieldsFor(block, screen, dataFields, schemas, recordsOf) : null,
                  schemas,
                  screenIds: loaded.screenIds,
                  icons,
                };

                return (
                  <li key={block.id} id={`block-${block.id}`} className={`rounded-xl border bg-surface ${expanded ? "border-border-strong" : "border-border"}`}>
                    <div className="flex items-center gap-1 py-1.5 pl-3 pr-1.5">
                      <span aria-hidden="true" className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        id={`block-${block.id}-toggle`}
                        aria-expanded={expanded}
                        aria-controls={bodyId}
                        onClick={() => setExpandedId(expanded ? null : block.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${hidden ? "text-ink-muted" : "text-ink"}`}>
                            {name}
                            <span className="sr-only">, block {index + 1} of {blocks.length}</span>
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {hidden && <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-ink-muted">Hidden</span>}
                            {block.tab && <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-ink-muted">Tab: {block.tab}</span>}
                            {errorCount > 0 && (
                              <span className="shrink-0 rounded-full bg-danger/10 px-1.5 text-xs font-medium text-danger-ink">
                                {errorCount} {errorCount === 1 ? "problem" : "problems"}
                              </span>
                            )}
                            {errorCount === 0 && warnings.length > 0 && <AlertTriangle aria-label="Has warnings" className="size-3.5 shrink-0 text-ink-muted" />}
                            <span className="truncate font-mono text-xs text-ink-muted">{summarizeProps(block)}</span>
                          </span>
                        </span>
                      </button>
                      <button type="button" onClick={() => patchBlock(block.id, { visible: hidden ? true : false })} aria-label={hidden ? `Show ${name} in the app` : `Hide ${name} in the app`} className={iconButtonClass}>
                        {hidden ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                      </button>
                      <button type="button" id={`block-${block.id}-up`} onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label={`Move ${name} up`} className={iconButtonClass}>
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </button>
                      <button type="button" id={`block-${block.id}-down`} onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} aria-label={`Move ${name} down`} className={iconButtonClass}>
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </button>
                    </div>

                    <div id={bodyId} hidden={!expanded} className="space-y-5 border-t border-border px-4 py-4 md:px-5">
                      {expanded && (
                        <>
                          {blockNotes.map((note) => (
                            <p
                              key={note.message}
                              className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${note.level === "error" ? "bg-danger/10 text-danger-ink" : "bg-surface-raised text-ink"}`}
                            >
                              <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                              {note.message}
                            </p>
                          ))}
                          {strayProps.length > 0 && (
                            <Button type="button" variant="ghost" size="small" onClick={() => removeProps(block.id, strayProps)}>
                              Remove {strayProps.join(", ")}
                            </Button>
                          )}
                          {spec?.list && (
                            <p className="text-xs text-ink-muted">
                              This block repeats for each{" "}
                              {isBinding(block.props.items) ? `entry of ${bindingPath(block.props.items)}` : "record"}; pick fields under
                              “Each entry” for its item props.
                            </p>
                          )}
                          {tabs.length > 0 && block.type !== "tab_bar" && (
                            <label className="block max-w-xs text-xs font-medium text-ink">
                              Shown on tab
                              <select
                                value={block.tab ?? ""}
                                onChange={(e) => patchBlock(block.id, { tab: e.target.value || undefined })}
                                className={`${inputClass} mt-1.5`}
                              >
                                <option value="">Every tab</option>
                                {block.tab && !tabs.includes(block.tab) && <option value={block.tab}>{block.tab} (no such tab)</option>}
                                {tabs.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {formProps(spec).length > 0 && (
                            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                              {formProps(spec).map(([propName, propSpec]) => (
                                <PropControl
                                  key={propName}
                                  idBase={`block-${block.id}`}
                                  name={propName}
                                  spec={propSpec}
                                  value={block.props[propName]}
                                  context={context}
                                  error={blockIssues.find((i) => i.prop === propName)?.message}
                                  onChange={(value) => updateProp(block.id, propName, value)}
                                  onJsonValidity={reportJson(`${block.id}:${propName}`)}
                                />
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <p className="font-mono text-xs text-ink-muted">
                              {block.type} · id {block.id}
                            </p>
                            <div className="flex gap-2">
                              <Button type="button" variant="ghost" size="small" onClick={() => duplicateBlock(index)}>
                                <Copy aria-hidden="true" className="mr-1.5 size-4" />
                                Duplicate
                              </Button>
                              <Button type="button" variant="ghost" size="small" color="error" onClick={() => removeBlock(index)}>
                                <Trash2 aria-hidden="true" className="mr-1.5 size-4" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-3">
            <button
              type="button"
              id="add-block-button"
              aria-expanded={pickerOpen}
              aria-controls="block-picker"
              onClick={() => setPickerOpen((open) => !open)}
              disabled={!manifest}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add block
            </button>
            {pickerOpen && manifest && (
              <ul id="block-picker" aria-label="Block types" className="mt-2 grid gap-2 rounded-xl border border-border bg-surface p-2 sm:grid-cols-2">
                {Object.entries(manifest).map(([type, spec]) => {
                  const required = Object.entries(spec.props).filter(([, p]) => p.required && p.type !== "node").map(([n]) => n);
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        onClick={() => addBlock(type)}
                        className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <span className="block text-sm font-medium text-ink">{spec.name}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {spec.list ? "Repeats per record · " : ""}
                          {required.length > 0 ? `Needs ${required.join(", ")}` : "No required props"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside aria-labelledby="preview-heading" className={`xl:sticky xl:top-0 ${mobilePane === "blocks" ? "hidden xl:block" : ""}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-heading" className="text-sm font-semibold text-ink">
              Preview
            </h2>
            {screen.type === "detail" && detailRecords.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <label htmlFor="preview-record">Record</label>
                <select id="preview-record" value={Math.min(sampleIndex, detailRecords.length - 1)} onChange={(e) => setSampleIndex(Number(e.target.value))} className={`${inputBaseClass} w-auto max-w-44 py-1 text-xs`}>
                  {detailRecords.map((record, i) => (
                    <option key={String(record.id ?? i)} value={i}>
                      {recordLabel(record)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tabs.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <label htmlFor="preview-tab">Tab</label>
                <select id="preview-tab" value={activePreviewTab} onChange={(e) => setPreviewTab(e.target.value)} className={`${inputBaseClass} w-auto py-1 text-xs`}>
                  {tabs.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={PREVIEW_PALETTES[screen.appearance ?? "light"]} className="mx-auto w-full max-w-[375px] overflow-hidden rounded-2xl border border-border-strong bg-page text-ink">
            <div className="max-h-[calc(100dvh-12rem)] space-y-5 overflow-y-auto p-4">
              {previewBlocks.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-muted">Nothing to show yet</p>
              ) : (
                previewBlocks.map((block) => (
                  <BlockPreview
                    key={block.id}
                    block={block}
                    spec={manifest?.[block.type]}
                    ctx={previewCtx}
                    selected={expandedId === block.id}
                    onSelect={() => revealBlock(block.id)}
                  />
                ))
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {screen.type === "detail"
              ? sample
                ? `Showing ${recordLabel(sample)}. `
                : "No records of this category yet, so bound values appear as field names. "
              : ""}
            A sketch of each block; the app applies its own styling.
            {hiddenCount > 0 && ` ${hiddenCount} hidden ${hiddenCount === 1 ? "block is" : "blocks are"} left out.`}
          </p>
        </aside>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        aria-labelledby="leave-screen-title"
        aria-describedby="leave-screen-description"
        slotProps={{ paper: { sx: { width: "100%", maxWidth: 420, m: 2, borderRadius: "16px", border: "1px solid var(--ds-border)" } } }}
      >
        <div className="p-6">
          <h2 id="leave-screen-title" className="text-lg font-semibold text-ink">
            Leave without saving?
          </h2>
          <p id="leave-screen-description" className="mt-1 text-sm text-ink-muted">
            Your changes to this screen haven't been saved to GitHub and will be lost.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" autoFocus onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
