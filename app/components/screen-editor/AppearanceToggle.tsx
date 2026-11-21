import type { ScreenFile } from "~/lib/screen-model";

interface AppearanceToggleProps {
  appearance: ScreenFile["appearance"];
  onAppearance: (appearance: "light" | "dark") => void;
}

/** Whether the app shows the screen light or dark. */
export function AppearanceToggle({ appearance, onAppearance }: AppearanceToggleProps) {
  return (
    <div className="text-xs font-medium text-ink">
      Appearance
      <div role="group" aria-label="Appearance" className="mt-1.5 inline-flex rounded-lg bg-surface-raised p-1">
        {(["light", "dark"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={appearance === option}
            onClick={() => onAppearance(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              appearance === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
