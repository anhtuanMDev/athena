import { ChevronDown } from "lucide-react";

import { SCREEN_TYPES } from "~/lib/screen-model";

import { SettingsFields } from "./SettingsFields";

import type { Category } from "~/lib/categories";
import type { SchemaInfo, ScreenFile, ScreenIssue } from "~/lib/screen-model";
import type { AppLimits } from "~/lib/screen-policy";

interface ScreenSettingsProps {
  screen: ScreenFile;
  isOpen: boolean;
  onToggle: () => void;
  /** The screen's own problems (no block's). */
  issues: ScreenIssue[];
  sources: { categories: readonly Category[]; schemas: SchemaInfo[]; limits: AppLimits };
  onUpdate: (patch: Partial<ScreenFile>) => void;
}

/** The screen's settings: a summary that opens them, and their fields. */
export function ScreenSettings({ screen, isOpen, onToggle, issues, sources, onUpdate }: ScreenSettingsProps) {
  const category = screen.source ? ` · ${sources.categories.find((entry) => entry.category === screen.source?.category)?.label ?? screen.source.category}` : "";
  return (
    <div className={`mb-4 rounded-xl border bg-surface ${isOpen ? "border-border-strong" : "border-border"}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="screen-settings"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ChevronDown aria-hidden="true" className={`size-4 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "" : "-rotate-90"}`} />
        <span className="flex-1">
          <span className="block text-sm font-medium text-ink">Screen settings</span>
          <span className="block text-xs text-ink-muted">
            {SCREEN_TYPES.find((option) => option.value === screen.type)?.label} · {screen.appearance === "dark" ? "Dark" : "Light"}
            {category}
          </span>
        </span>
        {issues.length > 0 && <span className="rounded-full bg-danger/10 px-1.5 text-xs font-medium text-danger-ink">{issues.length}</span>}
      </button>
      <div id="screen-settings" hidden={!isOpen} className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
        {isOpen && <SettingsFields screen={screen} issues={issues} sources={sources} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}
