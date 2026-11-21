import { inputClass } from "~/components/ui/input-classes";
import { ACCENT_HINTS } from "~/lib/colors";
import { SCREEN_TYPES } from "~/lib/screen-model";

import { AppearanceToggle } from "./AppearanceToggle";
import { ScreenSourceField } from "./ScreenSourceField";

import type { Category } from "~/lib/categories";
import type { SchemaInfo, ScreenFile, ScreenIssue } from "~/lib/screen-model";
import type { AppLimits } from "~/lib/screen-policy";

interface SettingsFieldsProps {
  screen: ScreenFile;
  issues: ScreenIssue[];
  sources: { categories: readonly Category[]; schemas: SchemaInfo[]; limits: AppLimits };
  onUpdate: (patch: Partial<ScreenFile>) => void;
}

/** A screen's title, type, appearance, records and accent, and their problems. */
export function SettingsFields({ screen, issues, sources, onUpdate }: SettingsFieldsProps) {
  return (
    <>
      <label className="block text-xs font-medium text-ink">
        Title
        <input value={screen.title ?? ""} onChange={(e) => onUpdate({ title: e.target.value || undefined })} className={`${inputClass} mt-1.5`} />
      </label>
      <label className="block text-xs font-medium text-ink">
        Type
        <select value={screen.type} onChange={(e) => onUpdate({ type: e.target.value as ScreenFile["type"] })} className={`${inputClass} mt-1.5`}>
          {SCREEN_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}: {option.hint}
            </option>
          ))}
        </select>
      </label>
      <AppearanceToggle appearance={screen.appearance} onAppearance={(appearance) => onUpdate({ appearance })} />
      <ScreenSourceField screen={screen} sources={sources} isInvalid={issues.length > 0} onSource={(source) => onUpdate({ source })} />
      {/* The app reads the accent on every screen type (zms ScreenView). */}
      <label className="block text-xs font-medium text-ink md:col-span-2">
        Accent color
        <input
          value={screen.accent ?? ""}
          placeholder={screen.type === "detail" ? ACCENT_HINTS.detail : ACCENT_HINTS.other}
          onChange={(e) => onUpdate({ accent: e.target.value || undefined })}
          className={`${inputClass} mt-1.5 font-mono`}
        />
      </label>
      {issues.map((issue) => (
        <p key={issue.message} className="text-xs text-danger-ink md:col-span-2">
          {issue.message}
        </p>
      ))}
    </>
  );
}
