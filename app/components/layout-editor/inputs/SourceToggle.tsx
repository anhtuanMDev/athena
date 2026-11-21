import type { SourceMode } from "../types";

interface SourceToggleProps {
  name: string;
  mode: SourceMode;
  onChange: (mode: SourceMode) => void;
}

/** Whether a prop holds a value of its own or reads a field. */
export function SourceToggle({ name, mode, onChange }: SourceToggleProps) {
  return (
    <div role="group" aria-label={`Source for ${name}`} className="inline-flex rounded-lg bg-surface-raised p-0.5">
      {(["value", "field"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus pointer-coarse:py-2 ${
            mode === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {option === "value" ? "Value" : "Field"}
        </button>
      ))}
    </div>
  );
}
