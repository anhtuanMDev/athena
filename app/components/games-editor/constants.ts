/** The drawer's paper: the dialog it is, and its size and colors. */
export const DRAWER_PAPER = {
  role: "dialog",
  "aria-modal": true,
  "aria-labelledby": "game-drawer-title",
  sx: { width: "100%", maxWidth: 448, backgroundColor: "var(--ds-surface)", borderLeft: "1px solid var(--ds-border)" },
};

/** The drawer's submit button, by what it does. */
export const SUBMIT_LABELS = { create: "Create Game", edit: "Save Changes" } as const;

/** Cards the games page shows while games.json loads. */
export const SKELETON_CARDS = 4;

/** The light palette's note under its tab. */
export const LIGHT_NOTE = "Light screens. An empty color is what the app uses today, shown greyed.";

/** The dark palette's note under its tab. */
export const DARK_NOTE = "Dark screens. Older app builds use these colors on every screen.";
