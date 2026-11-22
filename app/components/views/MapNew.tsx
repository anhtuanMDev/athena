import { useParams } from "react-router";

import { MapEditor } from "~/components/map-editor/MapEditor";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/maps/new: a map made from scratch (components/map-editor). */
export default function NewMap() {
  const { game = "" } = useParams();
  assertSafeGameSlug(game);
  return <MapEditor game={game} />;
}
