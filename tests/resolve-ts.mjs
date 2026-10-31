// Lets `node --test` load the app's TypeScript modules, which import each
// other without extensions (Vite's bundler resolution): "./screen-policy"
// resolves to "./screen-policy.ts".
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        // Fall through to the default resolution.
      }
    }
    return next(specifier, context);
  },
});
