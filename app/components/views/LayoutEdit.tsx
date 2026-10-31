import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router";
import Dialog from "@mui/material/Dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { BlockPreview } from "~/components/layout-editor/BlockPreview";
import { JsonInput, PropControl, inputClass } from "~/components/layout-editor/PropControl";
import { createFile, getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { useData } from "~/lib/use-data";
import {
  bindingPath,
  collectFields,
  createSection,
  extraProps,
  formProps,
  isBinding,
  normalizeManifest,
  readLayouts,
  recordFolderFor,
  recordLabel,
  validateSections,
  type FieldOption,
  type LayoutData,
  type LayoutIssue,
  type LayoutSection,
  type LayoutVariant,
  type PrimitiveManifest,
} from "~/lib/layout-model";

interface SchemaData {
  name: string;
  category: string;
  fields?: FieldOption[];
}

// The home screen has no schema file; its blocks bind to the app's global data store.
const HOME_SCHEMA: SchemaData = {
  name: "Home Screen",
  category: "global",
  fields: [
    { key: "game.name", type: "string" },
    { key: "game.current_patch", type: "string" },
    { key: "heroes", type: "collection" },
    { key: "maps", type: "collection" },
    { key: "modes", type: "collection" },
    { key: "patches", type: "collection" },
    { key: "items", type: "collection" },
  ],
};

const VARIANT_LABELS: Record<LayoutVariant, string> = {
  detail: "Detail screen",
  card: "List card",
};

const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

function summarizeProps(section: LayoutSection): string {
  const parts = Object.entries(section.props)
    .filter(([, value]) => value !== undefined)
    .slice(0, 3)
    .map(([name, value]) => {
      if (isBinding(value)) return `${name} ← ${bindingPath(value)}`;
      const text = typeof value === "string" ? `"${value}"` : JSON.stringify(value);
      return `${name}: ${text.length > 24 ? `${text.slice(0, 23)}…` : text}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "No props set";
}

function layoutsEqual(a: Record<LayoutVariant, LayoutSection[]>, b: Record<LayoutVariant, LayoutSection[]>) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function LayoutEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const isHome = id === "home";
  const layoutPath = `data/${game}/layouts/${id}.json`;
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaded, loading, error: loadError } = useData(
    async () => {
      if (!id) throw new Error("Layout ID missing from the address.");
      const schemaPromise = isHome
        ? Promise.resolve(HOME_SCHEMA)
        : getFile<SchemaData>(`data/${game}/schemas/${id}.json`).then((file) => {
            if (!file) throw new Error(`Schema "${id}" was not found in data/${game}/schemas.`);
            return file.content;
          });
      const [schema, layoutFile, manifestFile] = await Promise.all([
        schemaPromise,
        getFile<LayoutData>(layoutPath).catch(() => null),
        getFile(`data/_meta/mobile_primitives.json`).catch(() => null),
      ]);

      const folder = isHome ? null : recordFolderFor(schema.category);
      const records = folder
        ? await listDirectory<Record<string, unknown>>(game!, folder, true).catch(() => [])
        : [];

      return {
        schema,
        layout: layoutFile?.content ?? null,
        sha: layoutFile?.sha,
        manifest: normalizeManifest(manifestFile?.content),
        records: Array.isArray(records) ? records.filter((r) => r && typeof r === "object") : [],
      };
    },
    [game, id],
    `${game}-layout-${id}`,
  );

  const [layouts, setLayouts] = useState<Record<LayoutVariant, LayoutSection[]>>({ detail: [], card: [] });
  const [saved, setSaved] = useState<Record<LayoutVariant, LayoutSection[]> | null>(null);
  const [sha, setSha] = useState<string | undefined>();
  const [variant, setVariant] = useState<LayoutVariant>("detail");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"blocks" | "preview">("blocks");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const issuesHeadingRef = useRef<HTMLHeadingElement>(null);

  const dirty = saved !== null && !layoutsEqual(layouts, saved);

  // Take the file from GitHub on first load and after our own saves. A refetch that
  // lands while edits are unsaved is ignored, and the stale sha makes the next save
  // fail as a conflict instead of overwriting someone else's change.
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (!loaded) return;
    const current = savedRef.current;
    if (current !== null && !layoutsEqual(layoutsRef.current, current)) return;
    const next = readLayouts(loaded.layout);
    setLayouts(next);
    setSaved(next);
    setSha(loaded.sha);
  }, [loaded]);

  const manifest: PrimitiveManifest | null = loaded?.manifest ?? null;
  const records = loaded?.records ?? [];
  const sample = records[Math.min(sampleIndex, records.length - 1)] ?? null;
  const fields = useMemo(
    () => (loaded ? collectFields(loaded.schema.fields ?? [], loaded.records, !isHome) : []),
    [loaded, isHome],
  );

  const sections = layouts[variant];
  const issuesByVariant = useMemo(
    () => ({
      detail: validateSections(layouts.detail, manifest, fields),
      card: validateSections(layouts.card, manifest, fields),
    }),
    [layouts, manifest, fields],
  );
  // Missing required props only show once a save has been tried, so a block that was
  // just added isn't already shouting.
  const visibleIssues = (list: LayoutIssue[]) => list.filter((i) => attemptedSave || i.kind !== "required");
  const jsonErrorList = Object.entries(jsonErrors);
  const blockingCount =
    [...issuesByVariant.detail, ...issuesByVariant.card].filter((i) => i.level === "error").length + jsonErrorList.length;

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

  const setSections = (update: (current: LayoutSection[]) => LayoutSection[]) =>
    setLayouts((prev) => ({ ...prev, [variant]: update(prev[variant]) }));

  const nameOf = (section: LayoutSection) => manifest?.[section.type]?.name ?? section.type;

  const addSection = (type: string) => {
    const section = createSection(type);
    setSections((current) => [...current, section]);
    setExpandedId(section.id);
    setPickerOpen(false);
    pendingFocus.current = `block-${section.id}-toggle`;
    setAnnouncement(`Added ${manifest?.[type]?.name ?? type} as block ${sections.length + 1}.`);
  };

  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const section = sections[index];
    setSections((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    const edgeReached = target === 0 || target === sections.length - 1;
    const direction = delta < 0 ? "up" : "down";
    const opposite = delta < 0 ? "down" : "up";
    pendingFocus.current = `block-${section.id}-${edgeReached ? opposite : direction}`;
    setAnnouncement(`Moved ${nameOf(section)} to position ${target + 1} of ${sections.length}.`);
  };

  const toggleVisible = (section: LayoutSection) => {
    const visible = section.visible === false;
    setSections((current) => current.map((s) => (s.id === section.id ? { ...s, visible } : s)));
    setAnnouncement(`${nameOf(section)} is now ${visible ? "shown" : "hidden"} in the app.`);
  };

  const duplicateSection = (index: number) => {
    const original = sections[index];
    const copy = { ...createSection(original.type), props: structuredClone(original.props), visible: original.visible };
    setSections((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]);
    setExpandedId(copy.id);
    pendingFocus.current = `block-${copy.id}-toggle`;
    setAnnouncement(`Duplicated ${nameOf(original)} as block ${index + 2}.`);
  };

  const removeSection = (index: number) => {
    const section = sections[index];
    setSections((current) => current.filter((s) => s.id !== section.id));
    setJsonErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${section.id}:`))));
    const neighbour = sections[index + 1] ?? sections[index - 1];
    pendingFocus.current = neighbour ? `block-${neighbour.id}-toggle` : "add-block-button";
    setAnnouncement(`Removed ${nameOf(section)}.`);
  };

  const updateProp = (sectionId: string, name: string, value: unknown) =>
    setSections((current) =>
      current.map((s) => {
        if (s.id !== sectionId) return s;
        const props = { ...s.props };
        if (value === undefined) delete props[name];
        else props[name] = value;
        return { ...s, props };
      }),
    );

  const replaceExtraProps = (section: LayoutSection, extra: unknown) => {
    const spec = manifest?.[section.type];
    const kept = Object.fromEntries(formProps(spec).flatMap(([name]) => (name in section.props ? [[name, section.props[name]]] : [])));
    setSections((current) =>
      current.map((s) => (s.id === section.id ? { ...s, props: { ...kept, ...(extra as Record<string, unknown>) } } : s)),
    );
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

  const revealSection = (sectionId: string, sectionVariant: LayoutVariant = variant) => {
    setVariant(sectionVariant);
    setExpandedId(sectionId);
    setMobilePane("blocks");
    pendingFocus.current = `block-${sectionId}-toggle`;
    requestAnimationFrame(() => document.getElementById(`block-${sectionId}`)?.scrollIntoView({ block: "nearest" }));
  };

  const save = async () => {
    if (!loaded || submitting || (!dirty && sha)) return;
    setAttemptedSave(true);
    if (blockingCount > 0) {
      requestAnimationFrame(() => issuesHeadingRef.current?.focus());
      return;
    }
    setSubmitting(true);
    const content: LayoutData = {
      ...(loaded.layout ?? {}),
      schemaVersion: loaded.layout?.schemaVersion ?? 1,
      gameId: game,
      category: loaded.schema.category,
      sections: layouts.detail, // older app builds read `sections`
      detailLayout: layouts.detail,
      cardLayout: layouts.card,
    };
    const snapshot = layouts;
    try {
      const newSha = sha
        ? await updateFile(layoutPath, content, sha, `Update layout: ${id}`)
        : await createFile(layoutPath, content, `Create layout: ${id}`);
      // Edits made while the write was in flight stay unsaved, and the refetch the
      // write triggers is ignored while they do, so take the sha from the response.
      if (newSha) setSha(newSha);
      savedRef.current = snapshot;
      setSaved(snapshot);
      setAttemptedSave(false);
      toastSuccess("Layout saved. The app picks it up on its next config refresh.");
    } catch (err) {
      toastError(
        isConflictError(err)
          ? "This layout changed on GitHub after you opened it. Reload the page to get the latest version, then redo your changes."
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

  if (loadError || !loaded) {
    return (
      <LoadErrorState
        title="Couldn't load this layout"
        error={loadError ?? new Error("No data returned.")}
        onBack={() => window.history.back()}
      />
    );
  }

  const visibleSections = sections.filter((s) => s.visible !== false);
  const hiddenCount = sections.length - visibleSections.length;
  const currentIssues = issuesByVariant[variant];
  const summaryIssues: { issue: LayoutIssue; variant: LayoutVariant; section?: LayoutSection }[] = (
    ["detail", "card"] as LayoutVariant[]
  ).flatMap((v) =>
    visibleIssues(issuesByVariant[v])
      .filter((issue) => issue.level === "error")
      .map((issue) => ({ issue, variant: v, section: layouts[v].find((s) => s.id === issue.sectionId) })),
  );
  const previewRecords = variant === "card" ? (records.length > 0 ? records.slice(0, 3) : [null]) : [sample];

  return (
    <div className="w-full pb-32 pt-2">
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Link
            to={`/${game}/layouts`}
            className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            App layouts
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-balance text-ink">
            Layout Builder: {loaded.schema.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span className="font-mono text-xs">{layoutPath}</span>
            <span aria-live="polite" className="inline-flex items-center gap-1.5">
              {dirty ? (
                <>
                  <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                  Unsaved changes
                </>
              ) : !sha ? (
                "Not on GitHub yet"
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
          <Button type="button" onClick={save} disabled={submitting || (!dirty && !!sha)}>
            {submitting ? "Saving…" : "Save layout"}
          </Button>
        </div>
      </header>

      {!manifest && (
        <div role="note" className="mt-6 flex gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm text-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-mono text-xs">data/_meta/mobile_primitives.json</span> couldn't be loaded, so blocks
            can't be checked against the app's components. Props can still be edited as JSON.
          </p>
        </div>
      )}

      {attemptedSave && blockingCount > 0 && (
        <section
          aria-labelledby="layout-issues-heading"
          className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-4"
        >
          <h2
            id="layout-issues-heading"
            ref={issuesHeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-ink focus:outline-none"
          >
            Fix {blockingCount === 1 ? "1 problem" : `${blockingCount} problems`} before saving
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {summaryIssues.map(({ issue, variant: v, section }, i) => (
              <li key={`${v}-${issue.sectionId}-${issue.prop ?? i}`}>
                <button
                  type="button"
                  onClick={() => revealSection(issue.sectionId, v)}
                  className="rounded text-left text-danger-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {VARIANT_LABELS[v]}, {section ? nameOf(section) : issue.sectionId}: {issue.message}
                </button>
              </li>
            ))}
            {jsonErrorList.map(([key, message]) => {
              const sectionId = key.split(":")[0];
              const v = layouts.card.some((s) => s.id === sectionId) ? "card" : "detail";
              const section = layouts[v].find((s) => s.id === sectionId);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => revealSection(sectionId, v)}
                    className="rounded text-left text-danger-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {VARIANT_LABELS[v]}, {section ? nameOf(section) : sectionId}, {key.split(":")[1]}: {message}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {!isHome ? (
          <div role="group" aria-label="Layout to edit" className="inline-flex rounded-lg bg-surface-raised p-1">
            {(["detail", "card"] as LayoutVariant[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={variant === v}
                onClick={() => {
                  setVariant(v);
                  setPickerOpen(false);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                  variant === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                {VARIANT_LABELS[v]}
                <span className="ml-1.5 tabular-nums text-ink-muted">{layouts[v].length}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">The home screen has one layout, bound to the app's global data.</p>
        )}
        <div role="group" aria-label="Show" className="inline-flex rounded-lg bg-surface-raised p-1 xl:hidden">
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
          <h2 id="blocks-heading" className="sr-only">
            {VARIANT_LABELS[variant]} blocks
          </h2>

          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-6 py-8">
              <p className="text-sm font-semibold text-ink">No blocks on the {VARIANT_LABELS[variant].toLowerCase()} yet</p>
              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                {variant === "card"
                  ? "The list card is how each record appears in the app's list. Add a block, then point its props at fields such as name or a portrait."
                  : `Blocks render top to bottom. Add one, then bind its props to fields of ${loaded.schema.name} or type a fixed value.`}
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {sections.map((section, index) => {
                const spec = manifest?.[section.type];
                const expanded = expandedId === section.id;
                const blockIssues = visibleIssues(currentIssues.filter((i) => i.sectionId === section.id));
                const blockJsonErrors = jsonErrorList.filter(([key]) => key.startsWith(`${section.id}:`)).length;
                const errorCount = blockIssues.filter((i) => i.level === "error").length + blockJsonErrors;
                const warnings = blockIssues.filter((i) => i.level === "warning" && !i.prop);
                const hidden = section.visible === false;
                const bodyId = `block-${section.id}-body`;
                const name = nameOf(section);
                const extra = extraProps(section, spec);
                const extraIssues = blockIssues.filter((i) => i.prop && i.prop in extra);

                return (
                  <li
                    key={section.id}
                    id={`block-${section.id}`}
                    className={`rounded-xl border bg-surface ${expanded ? "border-border-strong" : "border-border"}`}
                  >
                    <div className="flex items-center gap-1 py-1.5 pl-3 pr-1.5">
                      <span aria-hidden="true" className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        id={`block-${section.id}-toggle`}
                        aria-expanded={expanded}
                        aria-controls={bodyId}
                        onClick={() => setExpandedId(expanded ? null : section.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${hidden ? "text-ink-muted" : "text-ink"}`}>
                            {name}
                            <span className="sr-only">, block {index + 1} of {sections.length}</span>
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {hidden && (
                              <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-ink-muted">
                                Hidden
                              </span>
                            )}
                            {errorCount > 0 && (
                              <span className="shrink-0 rounded-full bg-danger/10 px-1.5 text-xs font-medium text-danger-ink">
                                {errorCount} {errorCount === 1 ? "problem" : "problems"}
                              </span>
                            )}
                            {errorCount === 0 && warnings.length > 0 && (
                              <AlertTriangle aria-label="Has warnings" className="size-3.5 shrink-0 text-ink-muted" />
                            )}
                            <span className="truncate font-mono text-xs text-ink-muted">{summarizeProps(section)}</span>
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleVisible(section)}
                        aria-label={hidden ? `Show ${name} in the app` : `Hide ${name} in the app`}
                        className={iconButtonClass}
                      >
                        {hidden ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                      </button>
                      <button
                        type="button"
                        id={`block-${section.id}-up`}
                        onClick={() => moveSection(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${name} up`}
                        className={iconButtonClass}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        id={`block-${section.id}-down`}
                        onClick={() => moveSection(index, 1)}
                        disabled={index === sections.length - 1}
                        aria-label={`Move ${name} down`}
                        className={iconButtonClass}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </button>
                    </div>

                    <div id={bodyId} hidden={!expanded} className="space-y-5 border-t border-border px-4 py-4 md:px-5">
                      {expanded && (
                        <>
                          {warnings.map((w) => (
                            <p key={w.message} className="flex gap-2 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink">
                              <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                              {w.message}
                            </p>
                          ))}
                          {formProps(spec).length > 0 && (
                            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                              {formProps(spec).map(([propName, propSpec]) => {
                                const propIssue = blockIssues.find((i) => i.prop === propName && i.kind !== "node-prop");
                                return (
                                  <PropControl
                                    key={propName}
                                    idBase={`block-${section.id}`}
                                    name={propName}
                                    spec={propSpec}
                                    value={section.props[propName]}
                                    fields={fields}
                                    error={propIssue?.message}
                                    onChange={(value) => updateProp(section.id, propName, value)}
                                    onJsonValidity={reportJson(`${section.id}:${propName}`)}
                                  />
                                );
                              })}
                            </div>
                          )}
                          <div>
                            <label htmlFor={`block-${section.id}-extra`} className="font-mono text-xs font-medium text-ink">
                              {spec ? "Other props (JSON)" : "Props (JSON)"}
                            </label>
                            <p id={`block-${section.id}-extra-help`} className="mb-1.5 mt-0.5 text-xs text-ink-muted">
                              {spec
                                ? "Props the manifest doesn't list, such as style. Saved as written; \"data.field\" strings bind to a field."
                                : "Saved as written; \"data.field\" strings bind to a field."}
                            </p>
                            {extraIssues.map((i, n) => (
                              <p key={i.message} id={`block-${section.id}-extra-issue-${n}`} className="mb-1.5 text-xs text-danger-ink">
                                {i.message}
                              </p>
                            ))}
                            <JsonInput
                              id={`block-${section.id}-extra`}
                              value={extra}
                              expect="object"
                              rows={Object.keys(extra).length > 0 ? 4 : 2}
                              describedBy={[
                                `block-${section.id}-extra-help`,
                                ...extraIssues.map((_, n) => `block-${section.id}-extra-issue-${n}`),
                              ].join(" ")}
                              invalid={extraIssues.length > 0}
                              placeholder="{}"
                              onValid={(value) => replaceExtraProps(section, value)}
                              onValidity={reportJson(`${section.id}:other props`)}
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <p className="font-mono text-xs text-ink-muted">
                              {section.type} · id {section.id}
                            </p>
                            <div className="flex gap-2">
                              <Button type="button" variant="ghost" size="small" onClick={() => duplicateSection(index)}>
                                <Copy aria-hidden="true" className="mr-1.5 size-4" />
                                Duplicate
                              </Button>
                              <Button type="button" variant="ghost" size="small" color="error" onClick={() => removeSection(index)}>
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
                  const required = Object.entries(spec.props)
                    .filter(([, p]) => p.required && p.type !== "node")
                    .map(([name]) => name);
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        onClick={() => addSection(type)}
                        className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <span className="block text-sm font-medium text-ink">{spec.name}</span>
                        <span className="block truncate text-xs text-ink-muted">
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

        <aside
          aria-labelledby="preview-heading"
          className={`xl:sticky xl:top-0 ${mobilePane === "blocks" ? "hidden xl:block" : "mt-0"}`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="preview-heading" className="text-sm font-semibold text-ink">
              Preview
            </h2>
            {variant === "detail" && records.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <label htmlFor="preview-record">Record</label>
                <select
                  id="preview-record"
                  value={Math.min(sampleIndex, records.length - 1)}
                  onChange={(e) => setSampleIndex(Number(e.target.value))}
                  className={`${inputClass} w-auto max-w-44 py-1 text-xs`}
                >
                  {records.map((record, i) => (
                    <option key={String(record.id ?? i)} value={i}>
                      {recordLabel(record)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-2xl border border-border-strong bg-page text-ink">
            <div
              className={`max-h-[calc(100dvh-12rem)] overflow-y-auto p-4 ${variant === "card" ? "divide-y divide-border" : ""}`}
            >
              {visibleSections.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-muted">Nothing to show yet</p>
              ) : (
                previewRecords.map((record, i) => (
                  <div key={i} className={variant === "card" ? "space-y-3 py-3 first:pt-0 last:pb-0" : "space-y-3"}>
                    {visibleSections.map((section) => (
                      <BlockPreview
                        key={section.id}
                        section={section}
                        spec={manifest?.[section.type]}
                        data={record}
                        selected={expandedId === section.id}
                        onSelect={() => revealSection(section.id)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {isHome
              ? "Bound values appear as field names; the home screen reads the app's global data."
              : records.length === 0
                ? "No records of this category yet, so bound values appear as field names."
                : variant === "card"
                  ? `First ${previewRecords.length} of ${records.length} records.`
                  : `Showing ${recordLabel(sample ?? {})}.`}{" "}
            A sketch of each component; the app applies its own styling.
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
        aria-labelledby="leave-layout-title"
        aria-describedby="leave-layout-description"
        slotProps={{
          paper: { sx: { width: "100%", maxWidth: 420, m: 2, borderRadius: "16px", border: "1px solid var(--ds-border)" } },
        }}
      >
        <div className="p-6">
          <h2 id="leave-layout-title" className="text-lg font-semibold text-ink">
            Leave without saving?
          </h2>
          <p id="leave-layout-description" className="mt-1 text-sm text-ink-muted">
            Your changes to this layout haven't been saved to GitHub and will be lost.
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
