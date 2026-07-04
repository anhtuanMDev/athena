import { useParams } from "react-router";

// Heroes
import HeroesList from "~/components/views/HeroesList";
import HeroNew from "~/components/views/HeroNew";
import HeroEdit from "~/components/views/HeroEdit";
import HeroDelete from "~/components/views/HeroDelete";

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
import RawEdit from "~/components/views/RawEdit";

export default function GameDashboardRouter() {
  const params = useParams();
  const splat = params["*"] || "";
  const parts = splat.split("/");
  const entity = parts[0];
  const idOrAction = parts[1];
  const subAction = parts[2];

  // Route: /:game/schema
  if (entity === "schema") return <SchemaEdit />;

  // Route: /:game/raw/:type/:id
  if (entity === "raw") return <RawEdit />;

  // Entity routers
  switch (entity) {
    case "heroes":
      if (!idOrAction) return <HeroesList />;
      if (idOrAction === "new") return <HeroNew />;
      if (subAction === "delete") return <HeroDelete />;
      return <HeroEdit />;
      
    case "maps":
      if (!idOrAction) return <MapsList />;
      if (idOrAction === "new") return <MapNew />;
      return <MapEdit />;
      
    case "modes":
      if (!idOrAction) return <ModesList />;
      if (idOrAction === "new") return <ModeNew />;
      return <ModeEdit />;
      
    case "patches":
      if (!idOrAction) return <PatchesList />;
      if (idOrAction === "new") return <PatchNew />;
      return <PatchEdit />;
      
    case "items":
      if (!idOrAction) return <ItemsList />;
      if (idOrAction === "new") return <ItemNew />;
      return <ItemEdit />;
      
    default:
      return (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 dark:text-gray-400">
          <p>Select a category from the sidebar to manage {params.game}.</p>
        </div>
      );
  }
}
