import type { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
}

/** A block's title over its content; nothing without one. */
export function SectionTitle({ children }: SectionTitleProps) {
  if (!children) {
    return null;
  }
  return <p className="mb-2 text-sm font-bold uppercase tracking-wide">{children}</p>;
}
