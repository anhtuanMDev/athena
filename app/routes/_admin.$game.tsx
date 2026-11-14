import { lazy, Suspense, type ReactNode } from "react";
import { useParams } from "react-router";
import { PanelTransition } from "~/components/PanelTransition";
import { CATEGORY_ICON_COMPONENTS } from "~/components/CategoryIcon";
import { useCategories } from "~/lib/categories-context";
import {
  CardGridSkeleton,
  DeleteSkeleton,
  EntityListSkeleton,
  EnumFormSkeleton,
  FieldsFormSkeleton,
  LIST_SKELETONS,
  PanelsSkeleton,
  RawEditSkeleton,
  RecordListSkeleton,
  ScreenEditSkeleton,
  ScreensListSkeleton,
  SplitFormSkeleton,
  TallPanelSkeleton,
} from "~/components/views/ViewSkeletons";

// Each view's code loads when it's first opened, not with the route: the
// editors' forms, the screen editor and the schema builders came to 400 kB
// that every game page loaded, a list included. Meanwhile a view shows its
// own loading placeholder (ViewSkeletons.tsx), so the page looks the same
// while its code and then its data load. A chunk gone after a deploy reloads
// the page once (chunk-reload.ts).

// Heroes
const EntityDelete = lazy(() => import("~/components/views/EntityDelete"));
const HeroEdit = lazy(() => import("~/components/views/HeroEdit"));
const HeroesList = lazy(() => import("~/components/views/HeroesList"));
const HeroNew = lazy(() => import("~/components/views/HeroNew"));

// Maps
const MapEdit = lazy(() => import("~/components/views/MapEdit"));
const MapNew = lazy(() => import("~/components/views/MapNew"));
const MapsList = lazy(() => import("~/components/views/MapsList"));

// Modes
const ModeEdit = lazy(() => import("~/components/views/ModeEdit"));
const ModeNew = lazy(() => import("~/components/views/ModeNew"));
const ModesList = lazy(() => import("~/components/views/ModesList"));

// Enums
const EnumEdit = lazy(() => import("~/components/views/EnumEdit"));
const EnumNew = lazy(() => import("~/components/views/EnumNew"));
const EnumsList = lazy(() => import("~/components/views/EnumsList"));

// Misc
const DynamicSchemaEdit = lazy(() => import("~/components/views/DynamicSchemaEdit"));
const DynamicSchemaNew = lazy(() => import("~/components/views/DynamicSchemaNew"));
const DynamicSchemasList = lazy(() => import("~/components/views/DynamicSchemasList"));
const RawEdit = lazy(() => import("~/RawEdit"));

// Cron Jobs
const CronJobEdit = lazy(() => import("~/components/views/CronJobEdit"));
const CronJobNew = lazy(() => import("~/components/views/CronJobNew"));
const CronJobsList = lazy(() => import("~/components/views/CronJobsList"));
const ImportDraftReview = lazy(() => import("~/components/views/ImportDraftReview"));

// Every other category (news, patches, items…): records edited in their schema's own form
const RecordEditor = lazy(() => import("~/components/views/RecordEditor"));
const RecordList = lazy(() => import("~/components/views/RecordList"));

// App screens
const ScreenEdit = lazy(() => import("~/components/views/ScreenEdit"));
const ScreensList = lazy(() => import("~/components/views/ScreensList"));

/** A view in the panel, its own placeholder shown until its code is in (none for a form that shows at once). */
function View({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return (
    <PanelTransition>
      <Suspense fallback={fallback}>{children}</Suspense>
    </PanelTransition>
  );
}

/** Folders with editors of their own; every other configured category gets RecordList and RecordEditor. */
const BUILT_IN_EDITORS = ["heroes", "maps", "modes"];

export default function GameDashboardRouter() {
  const params = useParams();
  const categories = useCategories();
  const splat = params["*"] || "";
  const parts = splat.split("/");
  const entity = parts[0];
  const idOrAction = parts[1];
  const subAction = parts[2];

  // Route: /:game/schemas (New Dynamic)
  if (entity === "schemas") {
    if (!idOrAction)
      return (
        <View fallback={<CardGridSkeleton />}>
          <DynamicSchemasList />
        </View>
      );
    if (idOrAction === "new")
      return (
        <View>
          <DynamicSchemaNew />
        </View>
      );
    if (subAction === "delete")
      return (
        <View fallback={<DeleteSkeleton />}>
          <EntityDelete entityType="schemas" />
        </View>
      );
    return (
      <View fallback={<PanelsSkeleton />}>
        <DynamicSchemaEdit />
      </View>
    );
  }

  // Route: /:game/<folder> of a configured category (news, patches, items…)
  const configured = BUILT_IN_EDITORS.includes(entity) ? undefined : categories.find((c) => c.folder === entity);
  const form = configured && { category: configured.category, noun: configured.singular, icon: CATEGORY_ICON_COMPONENTS[configured.icon] };
  if (form) {
    if (!idOrAction)
      return (
        <View fallback={<RecordListSkeleton />}>
          <RecordList key={entity} {...form} />
        </View>
      );
    if (subAction === "delete")
      return (
        <View fallback={<DeleteSkeleton />}>
          <EntityDelete entityType={entity} />
        </View>
      );
    return (
      <View fallback={<TallPanelSkeleton />}>
        <RecordEditor key={entity} {...form} />
      </View>
    );
  }

  // Route: /:game/cron
  if (entity === "cron") {
    if (!idOrAction)
      return (
        <View fallback={<CardGridSkeleton />}>
          <CronJobsList />
        </View>
      );
    if (idOrAction === "new")
      return (
        <View>
          <CronJobNew />
        </View>
      );
    if (subAction === "delete")
      return (
        <View fallback={<DeleteSkeleton />}>
          <EntityDelete entityType="cron_jobs" />
        </View>
      );
    if (subAction === "review" && parts[3])
      return (
        <View fallback={<TallPanelSkeleton />}>
          <ImportDraftReview />
        </View>
      );
    return (
      <View fallback={<PanelsSkeleton />}>
        <CronJobEdit />
      </View>
    );
  }

  // Route: /:game/raw/:type/:id
  if (entity === "raw")
    return (
      <View fallback={<RawEditSkeleton />}>
        <RawEdit />
      </View>
    );

  // Route: /:game/screens/:id
  if (entity === "screens") {
    if (!idOrAction) {
      return (
        <View fallback={<ScreensListSkeleton />}>
          <ScreensList />
        </View>
      );
    }
    return (
      <View fallback={<ScreenEditSkeleton />}>
        <ScreenEdit />
      </View>
    );
  }

  // A view, and the placeholder it shows while loading.
  const renderContent = (): [ReactNode, ReactNode] => {
    switch (entity) {
      case "heroes":
        if (!idOrAction) return [<HeroesList />, <EntityListSkeleton {...LIST_SKELETONS.heroes} />];
        if (idOrAction === "new") return [<HeroNew />, <SplitFormSkeleton />];
        if (subAction === "delete") return [<EntityDelete entityType="heroes" />, <DeleteSkeleton />];
        return [<HeroEdit />, <SplitFormSkeleton />];

      case "maps":
        if (!idOrAction) return [<MapsList />, <EntityListSkeleton {...LIST_SKELETONS.maps} />];
        if (idOrAction === "new") return [<MapNew />, <FieldsFormSkeleton />];
        if (subAction === "delete") return [<EntityDelete entityType="maps" />, <DeleteSkeleton />];
        return [<MapEdit />, <FieldsFormSkeleton />];

      case "modes":
        if (!idOrAction) return [<ModesList />, <EntityListSkeleton {...LIST_SKELETONS.modes} />];
        if (idOrAction === "new") return [<ModeNew />, <SplitFormSkeleton />];
        if (subAction === "delete") return [<EntityDelete entityType="modes" />, <DeleteSkeleton />];
        return [<ModeEdit />, <SplitFormSkeleton />];

      case "enums":
        if (!idOrAction) return [<EnumsList />, <EntityListSkeleton {...LIST_SKELETONS.enums} />];
        if (idOrAction === "new") return [<EnumNew />, null];
        if (subAction === "delete") return [<EntityDelete entityType="enums" />, <DeleteSkeleton />];
        return [<EnumEdit />, <EnumFormSkeleton />];

      default:
        return [
          <div className="flex flex-col items-center justify-center py-24 text-ink-muted">
            <p>Select a category from the sidebar to manage {params.game}.</p>
          </div>,
          null,
        ];
    }
  };

  const [content, fallback] = renderContent();
  return <View fallback={fallback}>{content}</View>;
}
