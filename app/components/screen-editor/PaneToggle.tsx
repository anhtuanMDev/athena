interface PaneToggleProps {
  pane: "blocks" | "preview";
  onPane: (pane: "blocks" | "preview") => void;
}

/** On narrow screens, which of the blocks and the preview shows. */
export function PaneToggle({ pane, onPane }: PaneToggleProps) {
  return (
    <div className="mt-6 flex justify-end xl:hidden">
      <div role="group" aria-label="Show" className="inline-flex rounded-lg bg-surface-raised p-1">
        {(["blocks", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={pane === option}
            onClick={() => onPane(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              pane === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {option === "blocks" ? "Blocks" : "Preview"}
          </button>
        ))}
      </div>
    </div>
  );
}
