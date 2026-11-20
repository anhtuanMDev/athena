import { useParams } from "react-router";

import { NewSchemaForm } from "~/components/schema-editor/NewSchemaForm";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/schemas/new: a schema made from scratch, an AI's answer or another schema's fields (components/schema-editor). */
export default function DynamicSchemaNew() {
  const { game = "" } = useParams();
  assertSafeGameSlug(game);
  return <NewSchemaForm game={game} />;
}
