import { ChevronRight } from "lucide-react";

import type { ReactNode } from "react";

interface PreviewButtonProps {
  children: ReactNode;
  isDark?: boolean;
}

/** A block's button, as a sketch: the preview is itself a button, so this is a span. */
export function PreviewButton({ children, isDark }: PreviewButtonProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold uppercase italic ${
        isDark ? "bg-ink text-page" : "border border-border-strong"
      }`}
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </span>
  );
}
