import { useParams } from "react-router";
import { Box, FileClock, Newspaper, type LucideIcon } from "lucide-react";
import { PanelTransition } from "~/components/PanelTransition";

// Heroes
import EntityDelete from "~/components/views/EntityDelete";
import HeroEdit from "~/components/views/HeroEdit";
import HeroesList from "~/components/views/HeroesList";
import HeroNew from "~/components/views/HeroNew";

// Maps
import MapEdit from "~/components/views/MapEdit";
import MapNew from "~/components/views/MapNew";
import MapsList from "~/components/views/MapsList";

// Modes
import ModeEdit from "~/components/views/ModeEdit";
import ModeNew from "~/components/views/ModeNew";
import ModesList from "~/components/views/ModesList";

// Enums
import EnumEdit from "~/components/views/EnumEdit";
import EnumNew from "~/components/views/EnumNew";
import EnumsList from "~/components/views/EnumsList";

// Misc
import DynamicSchemaEdit from "~/components/views/DynamicSchemaEdit";
import DynamicSchemaNew from "~/components/views/DynamicSchemaNew";
import DynamicSchemasList from "~/components/views/DynamicSchemasList";
import RawEdit from "~/RawEdit";

// Cron Jobs
import CronJobEdit from "~/components/views/CronJobEdit";
import CronJobNew from "~/components/views/CronJobNew";
import CronJobsList from "~/components/views/CronJobsList";
import ImportDraftReview from "~/components/views/ImportDraftReview";

// News, patches and items: records edited in their schema's own form
import RecordEditor from "~/components/views/RecordEditor";
import RecordList from "~/components/views/RecordList";

// App screens
import ScreenEdit from "~/components/views/ScreenEdit";
import ScreensList from "~/components/views/ScreensList";

const SCHEMA_FORMS: Record<
  string,
  { category: string; noun: string; icon: LucideIcon }
> = {
  news: { category: "news", noun: "Article", icon: Newspaper },
  patches: { category: "patch", noun: "Patch", icon: FileClock },
  items: { category: "item", noun: "Item", icon: Box },
};

export default function GameDashboardRouter() {
  const params = useParams();
  const splat = params["*"] || "";
  const parts = splat.split("/");
  const entity = parts[0];
  const idOrAction = parts[1];
  const subAction = parts[2];

  // Route: /:game/schemas (New Dynamic)
  if (entity === "schemas") {
    if (!idOrAction)
      return (
        <PanelTransition>
          <DynamicSchemasList />
        </PanelTransition>
      );
    if (idOrAction === "new")
      return (
        <PanelTransition>
          <DynamicSchemaNew />
        </PanelTransition>
      );
    if (subAction === "delete")
      return (
        <PanelTransition>
          <EntityDelete entityType="schemas" />
        </PanelTransition>
      );
    return (
      <PanelTransition>
        <DynamicSchemaEdit />
      </PanelTransition>
    );
  }

  // Route: /:game/news, /:game/patches, /:game/items
  const form = Object.hasOwn(SCHEMA_FORMS, entity)
    ? SCHEMA_FORMS[entity]
    : undefined;
  if (form) {
    if (!idOrAction)
      return (
        <PanelTransition>
          <RecordList key={entity} {...form} />
        </PanelTransition>
      );
    if (subAction === "delete")
      return (
        <PanelTransition>
          <EntityDelete entityType={entity as "news" | "patches" | "items"} />
        </PanelTransition>
      );
    return (
      <PanelTransition>
        <RecordEditor key={entity} {...form} />
      </PanelTransition>
    );
  }

  // Route: /:game/cron
  if (entity === "cron") {
    if (!idOrAction)
      return (
        <PanelTransition>
          <CronJobsList />
        </PanelTransition>
      );
    if (idOrAction === "new")
      return (
        <PanelTransition>
          <CronJobNew />
        </PanelTransition>
      );
    if (subAction === "delete")
      return (
        <PanelTransition>
          <EntityDelete entityType="cron_jobs" />
        </PanelTransition>
      );
    if (subAction === "review" && parts[3])
      return (
        <PanelTransition>
          <ImportDraftReview />
        </PanelTransition>
      );
    return (
      <PanelTransition>
        <CronJobEdit />
      </PanelTransition>
    );
  }

  // Route: /:game/raw/:type/:id
  if (entity === "raw")
    return (
      <PanelTransition>
        <RawEdit />
      </PanelTransition>
    );

  // Route: /:game/screens/:id
  if (entity === "screens") {
    if (!idOrAction) {
      return (
        <PanelTransition>
          <ScreensList />
        </PanelTransition>
      );
    }
    return (
      <PanelTransition>
        <ScreenEdit />
      </PanelTransition>
    );
  }

  const renderContent = () => {
    switch (entity) {
      case "heroes":
        if (!idOrAction) return <HeroesList />;
        if (idOrAction === "new") return <HeroNew />;
        if (subAction === "delete") return <EntityDelete entityType="heroes" />;
        return <HeroEdit />;

      case "maps":
        if (!idOrAction) return <MapsList />;
        if (idOrAction === "new") return <MapNew />;
        if (subAction === "delete") return <EntityDelete entityType="maps" />;
        return <MapEdit />;

      case "modes":
        if (!idOrAction) return <ModesList />;
        if (idOrAction === "new") return <ModeNew />;
        if (subAction === "delete") return <EntityDelete entityType="modes" />;
        return <ModeEdit />;

      case "enums":
        if (!idOrAction) return <EnumsList />;
        if (idOrAction === "new") return <EnumNew />;
        if (subAction === "delete") return <EntityDelete entityType="enums" />;
        return <EnumEdit />;

      default:
        return (
          <div className="flex flex-col items-center justify-center py-24 text-ink-muted">
            <p>Select a category from the sidebar to manage {params.game}.</p>
          </div>
        );
    }
  };

  return <PanelTransition>{renderContent()}</PanelTransition>;
}
