import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { z } from "zod";

// Zod checks whether eval works by calling `new Function` when it builds its
// first object schema. The admin's CSP (public/_headers) has no 'unsafe-eval',
// so the browser reports that check as a violation even though zod catches
// it. jitless skips the check; routes, which build the schemas, load later.
z.config({ jitless: true });

hydrateRoot(
  document,
  <StrictMode>
    <HydratedRouter />
  </StrictMode>
);
