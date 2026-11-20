import { useParams } from "react-router";

import { HeroEditor } from "~/components/hero-editor/HeroEditor";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/heroes/new: a hero made from scratch or from an AI's answer (components/hero-editor). */
export default function NewHero() {
  const { game = "" } = useParams();
  assertSafeGameSlug(game);
  return <HeroEditor game={game} />;
}
