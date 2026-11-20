import { useParams } from "react-router";

import { ModeEditor } from "~/components/mode-editor/ModeEditor";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/modes/new: a mode made from scratch or from an AI's answer (components/mode-editor). */
export default function NewMode() {
  const { game = "" } = useParams();
  assertSafeGameSlug(game);
  return <ModeEditor game={game} />;
}
