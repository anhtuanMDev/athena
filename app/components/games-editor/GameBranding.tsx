import { GameIconField } from "./GameIconField";
import { GamePalette } from "./GamePalette";

import type { useGameDraft } from "./hooks/useGameDraft";

interface GameBrandingProps {
  form: ReturnType<typeof useGameDraft>;
  errorOf: (field: string) => string | undefined;
}

/** The game's icon and its colors. */
export function GameBranding({ form, errorOf }: GameBrandingProps) {
  return (
    <div className="flex flex-col gap-6 pt-6 border-t border-border">
      <div>
        <h3 className="text-sm font-semibold text-ink">Branding & Media</h3>
        <p className="text-xs text-ink-muted mb-4">Customize how the game appears in the dashboard.</p>
      </div>
      <div className="flex flex-col gap-5">
        <GameIconField icon={form.draft.icon} error={errorOf("icon")} onType={form.typeIcon} onPick={form.pickIcon} />
        <GamePalette form={form} />
      </div>
    </div>
  );
}
