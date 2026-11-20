import { useParams } from "react-router";

import { ModeEditor } from "~/components/mode-editor/ModeEditor";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/modes/:id: a mode's values edited and saved over its file (components/mode-editor). */
export default function EditMode() {
  const { game = "", "*": splat } = useParams();
  const id = splat?.split("/")[1] ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  return <ModeEditor game={game} id={id} />;
}
