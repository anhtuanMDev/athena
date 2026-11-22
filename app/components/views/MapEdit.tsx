import { useParams } from "react-router";

import { MapEditor } from "~/components/map-editor/MapEditor";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/maps/:id: a map's values edited and saved over its file (components/map-editor). */
export default function EditMap() {
  const { game = "", "*": splat } = useParams();
  const id = splat?.split("/")[1] ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  return <MapEditor game={game} id={id} />;
}
