import { createPagesFunctionHandler } from "@react-router/cloudflare";
// @ts-expect-error - build artifact exists after build
import * as build from "../build/server";

// @ts-expect-error - getLoadContext return type is strict but any value is accepted at runtime
export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: () => ({}),
});
