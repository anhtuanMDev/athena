import { useParams } from "react-router";
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

// Patches
import PatchEdit from "~/components/views/PatchEdit";
import PatchesList from "~/components/views/PatchesList";
import PatchNew from "~/components/views/PatchNew";

// Items
import ItemEdit from "~/components/views/ItemEdit";
import ItemNew from "~/components/views/ItemNew";
import ItemsList from "~/components/views/ItemsList";

// Enums
import EnumEdit from "~/components/views/EnumEdit";
import EnumNew from "~/components/views/EnumNew";
import EnumsList from "~/components/views/EnumsList";

// Misc
import DynamicSchemaEdit from "~/components/views/DynamicSchemaEdit";
import DynamicSchemaNew from "~/components/views/DynamicSchemaNew";
import DynamicSchemasList from "~/components/views/DynamicSchemasList";
import RawEdit from "~/components/views/RawEdit";

// Cron Jobs
import CronJobEdit from "~/components/views/CronJobEdit";
import CronJobNew from "~/components/views/CronJobNew";
import CronJobsList from "~/components/views/CronJobsList";

// Layouts
import LayoutEdit from "~/components/views/LayoutEdit";
import LayoutsList from "~/components/views/LayoutsList";

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

  // Route: /:game/layouts/:id
  if (entity === "layouts") {
    if (!idOrAction) {
      return (
        <PanelTransition>
          <LayoutsList />
        </PanelTransition>
      );
    }
    return (
      <PanelTransition>
        <LayoutEdit />
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

      case "patches":
        if (!idOrAction) return <PatchesList />;
        if (idOrAction === "new") return <PatchNew />;
        if (subAction === "delete")
          return <EntityDelete entityType="patches" />;
        return <PatchEdit />;

      case "items":
        if (!idOrAction) return <ItemsList />;
        if (idOrAction === "new") return <ItemNew />;
        if (subAction === "delete") return <EntityDelete entityType="items" />;
        return <ItemEdit />;

      case "enums":
        if (!idOrAction) return <EnumsList />;
        if (idOrAction === "new") return <EnumNew />;
        if (subAction === "delete") return <EntityDelete entityType="enums" />;
        return <EnumEdit />;

      default:
        return (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500 dark:text-gray-400">
            <p>Select a category from the sidebar to manage {params.game}.</p>
          </div>
        );
    }
  };

  return <PanelTransition>{renderContent()}</PanelTransition>;
}
