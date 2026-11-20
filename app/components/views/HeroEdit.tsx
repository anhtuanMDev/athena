import { useParams } from "react-router";

import { HeroEditor } from "~/components/hero-editor/HeroEditor";
import { assertSafeEntityId, assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/heroes/:id: a hero edited, reviewed and saved over its file (components/hero-editor). */
export default function EditHero() {
  const { game = "", "*": splat } = useParams();
  const id = splat?.split("/")[1] ?? "";
  assertSafeGameSlug(game);
  assertSafeEntityId(id);
  return <HeroEditor game={game} id={id} />;
}
