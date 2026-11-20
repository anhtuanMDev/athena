import { useParams } from "react-router";

import { EditSchemaPage } from "~/components/schema-editor/EditSchemaPage";
import { assertSafeGameSlug } from "~/lib/safe-path";

/** /:game/schemas/:id: a schema's fields edited and saved over its file (components/schema-editor). */
export default function DynamicSchemaEdit() {
  const { game = "", "*": splat } = useParams();
  assertSafeGameSlug(game);
  return <EditSchemaPage game={game} id={splat?.split("/")[1]} />;
}
