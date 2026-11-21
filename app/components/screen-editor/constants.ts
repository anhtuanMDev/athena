import type { CSSProperties } from "react";

/** A block row's show, hide and move buttons. */
export const iconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

/** A link-styled button in the list of problems. */
export const issueButtonClass =
  "rounded text-left text-danger-ink underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// The preview shows the screen in its own appearance, whatever the admin's theme is.
export const PREVIEW_PALETTES: Record<"light" | "dark", CSSProperties> = {
  light: {
    "--ds-page": "oklch(98.5% 0.002 247.839)",
    "--ds-surface": "oklch(100% 0 0)",
    "--ds-surface-raised": "oklch(96.7% 0.003 264.542)",
    "--ds-border": "oklch(92.8% 0.006 264.531)",
    "--ds-border-strong": "oklch(87.2% 0.01 258.338)",
    "--ds-ink": "oklch(21% 0.034 264.665)",
    "--ds-ink-muted": "oklch(55.1% 0.027 264.364)",
  } as CSSProperties,
  dark: {
    "--ds-page": "oklch(13% 0.028 261.692)",
    "--ds-surface": "oklch(21% 0.034 264.665)",
    "--ds-surface-raised": "oklch(27.8% 0.033 256.848)",
    "--ds-border": "oklch(27.8% 0.033 256.848)",
    "--ds-border-strong": "oklch(37.3% 0.034 259.733)",
    "--ds-ink": "oklch(98.5% 0.002 247.839)",
    "--ds-ink-muted": "oklch(70.7% 0.022 261.325)",
  } as CSSProperties,
};
