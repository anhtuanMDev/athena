// Lets `node --test` load the app's TypeScript modules, which import each
// other without extensions (Vite's bundler resolution): "./screen-policy"
// resolves to "./screen-policy.ts", and the app's "~/" alias to app/.
import { registerHooks } from "node:module";

const APP = new URL("../app/", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("~/")) specifier = APP + specifier.slice(2);
    if ((specifier.startsWith(".") || specifier.startsWith("file:")) && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        // Fall through to the default resolution.
      }
    }
    return next(specifier, context);
  },
});
