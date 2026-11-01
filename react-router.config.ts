import type { Config } from "@react-router/dev/config";
import { join } from "node:path";
import { writeInlineScriptHashes } from "./app/lib/csp-hashes";

export default {
  ssr: false,
  // After index.html is written: its inline scripts' hashes go into the CSP
  // of build/client/_headers (see app/lib/csp-hashes.ts). Fails the build
  // rather than ship a CSP that blocks them.
  async buildEnd({ reactRouterConfig }) {
    await writeInlineScriptHashes(join(reactRouterConfig.buildDirectory, "client"));
  },
} satisfies Config;
