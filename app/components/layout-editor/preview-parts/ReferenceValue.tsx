import { ChevronRight } from "lucide-react";

interface ReferenceValueProps {
  text: string;
  isLinked: boolean;
  isChip: boolean;
}

/**
 * A reference as field_section shows it: its label, as a chip in a list. One
 * the app opens looks like a link; it's a span, as the block preview is a
 * button (a link inside it would be a control within a control).
 */
export function ReferenceValue({ text, isLinked, isChip }: ReferenceValueProps) {
  const look = isChip ? "rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold" : "text-sm";
  return (
    <span className={`${look} ${isLinked ? "inline-flex items-center gap-0.5 text-primary-ink underline underline-offset-2" : ""}`}>
      {text}
      {isLinked && <ChevronRight aria-hidden="true" className="size-3 shrink-0" />}
    </span>
  );
}
