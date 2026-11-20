import { useParams } from "react-router";

import { EnumEditor } from "~/components/enum-editor/EnumEditor";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/enums/new: a global enum, its options, their icons and params (components/enum-editor). */
export default function EnumNew() {
  const { game = "" } = useParams();
  assertSafeGameSlug(game);
  return <EnumEditor game={game} />;
}
