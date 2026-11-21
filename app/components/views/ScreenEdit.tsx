import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useBlocker, useParams } from "react-router";

import { BlockPicker } from "~/components/screen-editor/BlockPicker";
import { BlockRow } from "~/components/screen-editor/BlockRow";
import { LeaveDialog } from "~/components/screen-editor/LeaveDialog";
import { LoadFailuresNote } from "~/components/screen-editor/LoadFailuresNote";
import { PaneToggle } from "~/components/screen-editor/PaneToggle";
import { PreviewPane } from "~/components/screen-editor/PreviewPane";
import { ScreenHeader } from "~/components/screen-editor/ScreenHeader";
import { ScreenIssues } from "~/components/screen-editor/ScreenIssues";
import { ScreenSettings } from "~/components/screen-editor/ScreenSettings";
import { useToast } from "~/components/ToastProvider";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { isConflictError, listDirectory, updateFile } from "~/lib/github";
import { useCategories } from "~/lib/categories-context";
import { enumOptions as optionsOf } from "~/lib/enum-options";
import { detailScreenFor, referenceFolder, referenceLabels, referenceRecords } from "~/lib/reference-labels";
import { homeData as appHomeData } from "~/lib/screen-fields";
import { loadScreenData } from "~/lib/screen-loader";
import {
  blockSpec,
  folderFor,
  iconOptions,
  itemFieldsFor,
  screenReferenceFolders,
  validateScreen,
  type FieldOption,
  type PrimitiveManifest,
  type RecordSource,
  type ScreenBlock,
  type ScreenFile,
  type ScreenIssue,
} from "~/lib/screen-model";
import { APP_POLICY, validateScreenFile } from "~/lib/screen-policy";
import { previewRecords } from "~/lib/screen-records";
import { saveStep } from "~/lib/screen-save";
import { githubSources } from "~/lib/screen-sources";
import { createBlock, readScreen, screenDataFields } from "~/lib/screen-starters";
import { useData } from "~/lib/use-data";
import { ScreenEditSkeleton } from "~/components/views/ViewSkeletons";

/** What the preview reads, as its pane takes it. */
type PreviewContext = ComponentProps<typeof PreviewPane>["preview"]["ctx"];

/** Folders whose records label a screen's references, as the app loads at most (zms's screen scope). */
const MAX_REFERENCE_FOLDERS = 3;


function tabsOf(screen: ScreenFile): string[] {
  const bar = screen.blocks.find((b) => b.type === "tab_bar" && b.visible !== false);
  return typeof bar?.props.tabs === "string" ? bar.props.tabs.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

export default function ScreenEdit() {
  const { game, "*": splat } = useParams();
  const configured = useCategories();
  const folders = configured.map((c) => c.folder).join();
  const id = splat?.split("/")[1] ?? "";
  const screenPath = `data/${game}/screens/${id}.json`;
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaded, loading, error: loadError } = useData(
    // Each source read on its own: one that fails is left out and named (LoadFailuresNote), not the whole page.
    async () => loadScreenData(githubSources(game ?? ""), { game: game ?? "", id, path: screenPath, categories: configured }),
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
  useEffect(() => {
    dirtyRef.current = dirty;
  });
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
  // The app's policy, and where this screen's actions lead: the game's screens, this one by its id (F9).
  const policy = useMemo(() => (loaded ? { ...loaded.policy, screens: loaded.screens, screenId: id } : undefined), [loaded, id]);

  // A screen moved to another category while it's edited shows that
  // category's records whole too, once they're read; summaries until then.
  const sourceCategory = screen?.source?.category;
  const otherWholeFolder = loaded && sourceCategory && sourceCategory !== loaded.wholeCategory ? folderFor(sourceCategory, configured) : null;
  const { data: otherWhole } = useData(
    async () => (otherWholeFolder ? listDirectory<Record<string, unknown>>(game!, otherWholeFolder, true).catch(() => null) : null),
    [game, otherWholeFolder],
    `${game}-screen-whole-records`,
  );
  const records = useMemo<Record<string, Record<string, unknown>[]>>(() => {
    const read = loaded?.records ?? {};
    return sourceCategory && otherWholeFolder && Array.isArray(otherWhole) ? { ...read, [sourceCategory]: otherWhole } : read;
  }, [loaded, sourceCategory, otherWholeFolder, otherWhole]);

  // What the app lists for a source: its schema's records, sorted, and capped at its list size.
  const recordsFor = useCallback(
    (source: RecordSource | undefined) =>
      source && loaded
        ? previewRecords(records[source.category] ?? [], source, { schemas: loaded.schemas.filter((schema) => schema.category === source.category), limits: loaded.policy.limits })
        : [],
    [loaded, records],
  );

  const detailRecords = screen?.type === "detail" && screen.source ? records[screen.source.category] ?? [] : [];
  const sample = detailRecords[Math.min(sampleIndex, detailRecords.length - 1)] ?? null;

  // What "data." reads here, as the app gives it: the record on detail screens, the game
  // and the folders elsewhere, whose source's fields only feed the filter chips (C4).
  const { data: dataFields, filter: chipFields } = useMemo<{ data: FieldOption[]; filter: FieldOption[] }>(
    () => (screen ? screenDataFields(screen, { schemas, categories: configured, records: detailRecords }) : { data: [], filter: [] }),
    [screen, schemas, detailRecords, configured],
  );

  const homeData = useMemo(() => appHomeData(loaded?.game, records, configured), [loaded, records, configured]);

  // An enum field's options as the app reads them, descriptions and params included (field_section shows them).
  const enumOptions = useCallback(
    (field: FieldOption | undefined) => {
      if (!field) return [];
      if (field.globalEnumId) return optionsOf(loaded?.enums.find((e) => e.id === field.globalEnumId));
      return (field.options ?? []).map((o) => ({ id: o, name: o }));
    },
    [loaded],
  );

  const recordsOf = useCallback((category: string) => records[category] ?? [], [records]);
  const issues = useMemo(
    () =>
      screen && policy
        ? validateScreen(screen, manifest, dataFields, schemas, loaded?.screenIds ?? [], recordsOf, { ...policy, categories: configured })
        : [],
    [screen, manifest, dataFields, schemas, loaded, recordsOf, policy, configured],
  );
  // The app labels a screen's references from the records of at most 3 folders
  // (zms's screen scope): those its visible blocks' bindings point into first.
  // The editor has their records already (every category with a schema).
  const referenceFoldersShown = useMemo(
    () =>
      screen
        ? screenReferenceFolders(screen, dataFields, schemas, configured, MAX_REFERENCE_FOLDERS, recordsOf)
        : [],
    [screen, dataFields, schemas, recordsOf, configured],
  );
  const reference = useMemo<PreviewContext["reference"]>(() => {
    const built = new Map<FieldOption, { labels: Map<string, string>; records: Map<string, Record<string, unknown>> }>();
    return (field, id) => {
      const folder = referenceFolder(field, configured);
      const category = configured.find((c) => c.folder === folder)?.category;
      if (!folder || !category || !referenceFoldersShown.includes(folder)) return undefined;
      let found = built.get(field);
      if (!found) {
        const shown = records[category] ?? [];
        found = { labels: referenceLabels(shown, field), records: referenceRecords(shown, field) };
        built.set(field, found);
      }
      const label = found.labels.get(id);
      if (label === undefined) return undefined;
      // The app opens the record (linkReferences) when it has an id and one detail screen shows its category.
      const target = found.records.get(id)?.id;
      const linked = typeof target === "string" && target !== "" && !!detailScreenFor([...(loaded?.otherScreens ?? []), screen], category);
      return { label, linked };
    };
  }, [configured, referenceFoldersShown, loaded, records, screen]);
  const visibleIssues = (list: ScreenIssue[]) => list.filter((i) => attemptedSave || i.kind !== "required");
  const jsonErrorList = Object.entries(jsonErrors);
  // The same structural check the write API runs, so a save never fails there unexpectedly.
  const fileErrors = useMemo(() => (screen && policy ? validateScreenFile(screen, policy, configured) : []), [screen, policy, configured]);
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
  const nameOf = (block: ScreenBlock) => blockSpec(manifest, block.type)?.name ?? block.type;

  const addBlock = (type: string) => {
    const block = createBlock(type);
    setBlocks((current) => [...current, block]);
    setExpandedId(block.id);
    setPickerOpen(false);
    pendingFocus.current = `block-${block.id}-toggle`;
    setAnnouncement(`Added ${blockSpec(manifest, type)?.name ?? type} as block ${String(blocks.length + 1)}.`);
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
    // Checks run on what loaded: with a source missing, they can't vouch for the screen (LoadFailuresNote).
    const step = saveStep({ isDirty: dirty, isSubmitting: submitting, failed: loaded.failed, blockingCount });
    if (step.kind === "refused") {
      toastError(step.reason);
      return;
    }
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
    return <ScreenEditSkeleton />;
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
    itemFieldsFor: (block) => itemFieldsFor(block, screen, dataFields, schemas, recordsOf),
    reference,
    screenSource: screen.source,
    routeStops: (policy ?? APP_POLICY).limits.routeStops,
    pictures: policy ?? APP_POLICY,
  };
  const summaryIssues = visibleIssues(issues).filter((i) => i.level === "error");
  const screenIssues = visibleIssues(issues).filter((i) => !i.sectionId);

  const blockName = (blockId: string) => {
    const block = blocks.find((entry) => entry.id === blockId);
    return block ? nameOf(block) : undefined;
  };
  const blockActions = {
    toggle: (blockId: string) => setExpandedId((current) => (current === blockId ? null : blockId)),
    patch: patchBlock,
    move: moveBlock,
    updateProp,
    removeProps,
    duplicate: duplicateBlock,
    remove: removeBlock,
    reportJson,
  };
  const contextOf = (block: ScreenBlock) => ({
    dataFields,
    chipFields,
    itemFields: blockSpec(manifest, block.type)?.list ? itemFieldsFor(block, screen, dataFields, schemas, recordsOf) : null,
    schemas,
    screenIds: loaded.screenIds,
    appScreens: loaded.policy.appScreens,
    limits: loaded.policy.limits,
    icons,
  });

  return (
    <div className="w-full pb-32 pt-2">
      <ScreenHeader game={game} title={screen.title} id={id} path={screenPath} isDirty={dirty} isSubmitting={submitting} onSave={save} />

      {!manifest && (
        <div role="note" className="mt-6 flex gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm text-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-mono text-xs">data/_meta/mobile_primitives.json</span> couldn't be loaded, so blocks can't
            be checked against the app. Props can still be edited as JSON.
          </p>
        </div>
      )}

      <LoadFailuresNote failed={loaded.failed} />

      {attemptedSave && blockingCount > 0 && (
        <ScreenIssues
          count={blockingCount}
          problems={{ issues: summaryIssues, fileErrors: listedFileErrors, jsonErrors: jsonErrorList }}
          blockName={blockName}
          onReveal={revealBlock}
          headingRef={issuesHeadingRef}
        />
      )}

      <PaneToggle pane={mobilePane} onPane={setMobilePane} />

      <div className="mt-4 items-start gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_375px]">
        <section aria-labelledby="blocks-heading" className={mobilePane === "preview" ? "hidden xl:block" : ""}>
          <ScreenSettings
            screen={screen}
            isOpen={settingsOpen}
            onToggle={() => setSettingsOpen((open) => !open)}
            issues={screenIssues}
            sources={{ categories: configured, schemas, limits: loaded.policy.limits }}
            onUpdate={update}
          />

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
              {blocks.map((block, index) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  position={{ index, count: blocks.length }}
                  spec={blockSpec(manifest, block.type)}
                  issues={visibleIssues(issues.filter((issue) => issue.sectionId === block.id))}
                  form={{ isExpanded: expandedId === block.id, context: contextOf(block), tabs, jsonErrorCount: jsonErrorList.filter(([key]) => key.startsWith(`${block.id}:`)).length }}
                  actions={blockActions}
                />
              ))}
            </ol>
          )}

          <BlockPicker manifest={manifest} isOpen={pickerOpen} onToggle={() => setPickerOpen((open) => !open)} onAdd={addBlock} />
        </section>

        <PreviewPane
          isHidden={mobilePane === "blocks"}
          screen={screen}
          sample={{ records: detailRecords, index: sampleIndex, onIndex: setSampleIndex, record: sample }}
          tabs={{ list: tabs, active: activePreviewTab, onTab: setPreviewTab }}
          preview={{ blocks: previewBlocks, hiddenCount, manifest, ctx: previewCtx }}
          selection={{ selectedId: expandedId, onSelect: revealBlock }}
        />
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <LeaveDialog blocker={blocker} />
    </div>
  );
}
