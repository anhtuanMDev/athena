import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useParams } from "react-router";

import { BlockPicker } from "~/components/screen-editor/BlockPicker";
import { BlockRow } from "~/components/screen-editor/BlockRow";
import { LeaveDialog } from "~/components/screen-editor/LeaveDialog";
import { LoadFailuresNote } from "~/components/screen-editor/LoadFailuresNote";
import { PaneToggle } from "~/components/screen-editor/PaneToggle";
import { PreviewPane } from "~/components/screen-editor/PreviewPane";
import { ScreenHeader } from "~/components/screen-editor/ScreenHeader";
import { ScreenIssues } from "~/components/screen-editor/ScreenIssues";
import { ScreenSettings } from "~/components/screen-editor/ScreenSettings";
import { useBlockEditing } from "~/components/screen-editor/useBlockEditing";
import { useLeaveGuard } from "~/components/screen-editor/useLeaveGuard";
import { useSaveShortcut } from "~/components/screen-editor/useSaveShortcut";
import { useScreenSave } from "~/components/screen-editor/useScreenSave";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { listDirectory } from "~/lib/github";
import { useCategories } from "~/lib/categories-context";
import { enumOptions as optionsOf } from "~/lib/enum-options";
import { referenceLookup } from "~/lib/reference-lookup";
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
import { githubSources } from "~/lib/screen-sources";
import { readScreen, screenDataFields } from "~/lib/screen-starters";
import { useData } from "~/lib/use-data";
import { ScreenEditSkeleton } from "~/components/views/ViewSkeletons";

/** What the preview reads, as its pane takes it. */
type PreviewContext = ComponentProps<typeof PreviewPane>["preview"]["ctx"];

/** Folders whose records label a screen's references, as the app loads at most (zms's screen scope). */
const MAX_REFERENCE_FOLDERS = 3;


function tabsOf(screen: ScreenFile): string[] {
  const tabBar = screen.blocks.find((block) => block.type === "tab_bar" && block.visible !== false);
  return typeof tabBar?.props.tabs === "string" ? tabBar.props.tabs.split(",").map((t) => t.trim()).filter(Boolean) : [];
}

export default function ScreenEdit() {
  const { game, "*": splat } = useParams();
  const configured = useCategories();
  const folders = configured.map((category) => category.folder).join();
  const id = splat?.split("/")[1] ?? "";
  const screenPath = `data/${String(game)}/screens/${id}.json`;

  const { data: loaded, loading: isLoading, error: loadError } = useData(
    // Each source read on its own: one that fails is left out and named (LoadFailuresNote), not the whole page.
    async () => loadScreenData(githubSources(game ?? ""), { game: game ?? "", id, path: screenPath, categories: configured }),
    [game, id, folders],
    `${String(game)}-screen-${id}-${folders}`,
  );

  const [screen, setScreen] = useState<ScreenFile | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [sha, setSha] = useState<string | undefined>();
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<"blocks" | "preview">("blocks");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [previewTab, setPreviewTab] = useState<string | undefined>();
  const [hasAttemptedSave, setAttemptedSave] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const issuesHeadingRef = useRef<HTMLHeadingElement>(null);
  // Which block is open, the picker, the JSON boxes that don't parse, and the operations on blocks.
  const editing = useBlockEditing({ screen, setScreen, manifest: loaded?.manifest ?? null, show: { settings: () => { setSettingsOpen(true); }, blocks: () => { setMobilePane("blocks"); } } });
  const { jsonErrors } = editing;

  const snapshot = screen ? JSON.stringify(screen) : null;
  const isDirty = saved !== null && snapshot !== saved;

  // Take the file on first load and after our own saves; a refetch that lands
  // while edits are unsaved is ignored, so a stale sha surfaces as a conflict.
  const dirtyRef = useRef(isDirty);
  useEffect(() => {
    dirtyRef.current = isDirty;
  });
  useEffect(() => {
    if (!loaded || dirtyRef.current) {
      return;
    }
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
    `${String(game)}-screen-whole-records`,
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
      if (!field) {
        return [];
      }
      if (field.globalEnumId) {
        return optionsOf(loaded?.enums.find((e) => e.id === field.globalEnumId));
      }
      return (field.options ?? []).map((option) => ({ id: option, name: option }));
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
  // A reference's label, and whether the app opens its record (linkReferences): one detail screen of the game, this one as edited, shows its category.
  const reference = useMemo<PreviewContext["reference"]>(
    () => referenceLookup({ categories: configured, shownFolders: referenceFoldersShown, records, screens: [...(loaded?.otherScreens ?? []), screen] }),
    [configured, referenceFoldersShown, loaded, records, screen],
  );
  const visibleIssues = (list: ScreenIssue[]) => list.filter((i) => hasAttemptedSave || i.kind !== "required");
  const jsonErrorList = Object.entries(jsonErrors);
  // The same structural check the write API runs, so a save never fails there unexpectedly.
  const fileErrors = useMemo(() => (screen && policy ? validateScreenFile(screen, policy, configured) : []), [screen, policy, configured]);
  const errorCount = issues.filter((i) => i.level === "error").length;
  // File errors mostly repeat the editor's own checks: list and count them only when those pass.
  const listedFileErrors = errorCount > 0 ? [] : fileErrors;
  const blockingCount = errorCount + jsonErrorList.length + listedFileErrors.length;

  const blocker = useLeaveGuard(isDirty);
  const save = useScreenSave({
    draft: { file: loaded?.file, screen, failed: loaded?.failed ?? [] },
    target: { path: screenPath, id, sha },
    state: { isDirty, isSubmitting, blockingCount },
    flags: { setAttempted: setAttemptedSave, setSubmitting },
    headingRef: issuesHeadingRef,
    onSaved: (savedSnapshot, newSha) => {
      if (newSha) {
        setSha(newSha);
      }
      setSaved(savedSnapshot);
    },
  });
  useSaveShortcut(save);

  const update = (patch: Partial<ScreenFile>) => setScreen((prev) => (prev ? { ...prev, ...patch } : prev));
  const blocks = screen?.blocks ?? [];

  if (isLoading && !loaded) {
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
  const previewBlocks = blocks.filter((block) => block.visible !== false && (!block.tab || !activePreviewTab || block.tab === activePreviewTab));
  const hiddenCount = blocks.filter((block) => block.visible === false).length;
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
      <ScreenHeader game={game} title={screen.title} id={id} path={screenPath} isDirty={isDirty} isSubmitting={isSubmitting} onSave={save} />

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

      {hasAttemptedSave && blockingCount > 0 && (
        <ScreenIssues
          count={blockingCount}
          problems={{ issues: summaryIssues, fileErrors: listedFileErrors, jsonErrors: jsonErrorList }}
          blockName={editing.blockName}
          onReveal={editing.revealBlock}
          headingRef={issuesHeadingRef}
        />
      )}

      <PaneToggle pane={mobilePane} onPane={setMobilePane} />

      <div className="mt-4 items-start gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_375px]">
        <section aria-labelledby="blocks-heading" className={mobilePane === "preview" ? "hidden xl:block" : ""}>
          <ScreenSettings
            screen={screen}
            isOpen={isSettingsOpen}
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
                  form={{ isExpanded: editing.expandedId === block.id, context: contextOf(block), tabs, jsonErrorCount: jsonErrorList.filter(([key]) => key.startsWith(`${block.id}:`)).length }}
                  actions={editing.actions}
                />
              ))}
            </ol>
          )}

          <BlockPicker manifest={manifest} isOpen={editing.isPickerOpen} onToggle={editing.togglePicker} onAdd={editing.addBlock} />
        </section>

        <PreviewPane
          isHidden={mobilePane === "blocks"}
          screen={screen}
          sample={{ records: detailRecords, index: sampleIndex, onIndex: setSampleIndex, record: sample }}
          tabs={{ list: tabs, active: activePreviewTab, onTab: setPreviewTab }}
          preview={{ blocks: previewBlocks, hiddenCount, manifest, ctx: previewCtx }}
          selection={{ selectedId: editing.expandedId, onSelect: editing.revealBlock }}
        />
      </div>

      <div aria-live="polite" className="sr-only">
        {editing.announcement}
      </div>

      <LeaveDialog blocker={blocker} />
    </div>
  );
}
