import { useParams } from "react-router";

import { EnumEditor } from "~/components/enum-editor/EnumEditor";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/enums/:id: a global enum edited, reviewed and saved over its file (components/enum-editor). */
export default function EnumEdit() {
  const { game = "", "*": splat } = useParams();
  const id = splat?.split("/")[1] ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  return <EnumEditor game={game} id={id} />;
}
