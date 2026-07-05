import { useParams, useLocation } from "react-router";
import { PanelTransition } from "~/components/PanelTransition";

// Heroes
import HeroesList from "~/components/views/HeroesList";
import HeroNew from "~/components/views/HeroNew";
import HeroEdit from "~/components/views/HeroEdit";
import EntityDelete from "~/components/views/EntityDelete";

// Maps
import MapsList from "~/components/views/MapsList";
import MapNew from "~/components/views/MapNew";
import MapEdit from "~/components/views/MapEdit";

// Modes
import ModesList from "~/components/views/ModesList";
import ModeNew from "~/components/views/ModeNew";
import ModeEdit from "~/components/views/ModeEdit";

// Patches
import PatchesList from "~/components/views/PatchesList";
import PatchNew from "~/components/views/PatchNew";
import PatchEdit from "~/components/views/PatchEdit";

// Items
import ItemsList from "~/components/views/ItemsList";
import ItemNew from "~/components/views/ItemNew";
import ItemEdit from "~/components/views/ItemEdit";

// Misc
import SchemaEdit from "~/components/views/SchemaEdit";
import DynamicSchemasList from "~/components/views/DynamicSchemasList";
import DynamicSchemaNew from "~/components/views/DynamicSchemaNew";
import DynamicSchemaEdit from "~/components/views/DynamicSchemaEdit";
import RawEdit from "~/components/views/RawEdit";

export default function GameDashboardRouter() {
  const params = useParams();
  const splat = params["*"] || "";
  const parts = splat.split("/");
  const entity = parts[0];
  const idOrAction = parts[1];
  const subAction = parts[2];

  // Route: /:game/schema (Legacy)
  if (entity === "schema") return <PanelTransition><SchemaEdit /></PanelTransition>;
  
  // Route: /:game/schemas (New Dynamic)
  if (entity === "schemas") {
    if (!idOrAction) return <PanelTransition><DynamicSchemasList /></PanelTransition>;
    if (idOrAction === "new") return <PanelTransition><><DynamicSchemasList /><DynamicSchemaNew /></></PanelTransition>;
    // if (subAction === "delete") return <EntityDelete entityType="schemas" />;
    return <PanelTransition><DynamicSchemaEdit /></PanelTransition>;
  }

  // Route: /:game/raw/:type/:id
  if (entity === "raw") return <PanelTransition><RawEdit /></PanelTransition>;

  const renderContent = () => {
    switch (entity) {
    case "heroes":
      if (!idOrAction) return <HeroesList />;
      if (idOrAction === "new") return <HeroNew />;
      if (subAction === "delete") return <EntityDelete entityType="heroes" />;
      return <HeroEdit />;
      
    case "maps":
      if (!idOrAction) return <MapsList />;
      if (idOrAction === "new") return <><MapsList /><MapNew /></>;
      if (subAction === "delete") return <EntityDelete entityType="maps" />;
      return <MapEdit />;
      
    case "modes":
      if (!idOrAction) return <ModesList />;
      if (idOrAction === "new") return <><ModesList /><ModeNew /></>;
      if (subAction === "delete") return <EntityDelete entityType="modes" />;
      return <ModeEdit />;
      
    case "patches":
      if (!idOrAction) return <PatchesList />;
      if (idOrAction === "new") return <><PatchesList /><PatchNew /></>;
      if (subAction === "delete") return <EntityDelete entityType="patches" />;
      return <PatchEdit />;
      
    case "items":
      if (!idOrAction) return <ItemsList />;
      if (idOrAction === "new") return <><ItemsList /><ItemNew /></>;
      if (subAction === "delete") return <EntityDelete entityType="items" />;
      return <ItemEdit />;
      
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
