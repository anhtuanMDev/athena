import { GameActiveField } from "./GameActiveField";
import { GameBranding } from "./GameBranding";
import { GameFormActions } from "./GameFormActions";
import { GameGeneralFields } from "./GameGeneralFields";
import { draftOf, isDraftChanged } from "./utils/gameDraft";

import type { useGameDraft } from "./hooks/useGameDraft";
import type { useGameSave } from "./hooks/useGameSave";
import type { GameFormMode } from "./types";
import type { Game } from "~/schemas/game";

interface GameFormProps {
  mode: GameFormMode;
  original: Game | null;
  form: ReturnType<typeof useGameDraft>;
  saver: ReturnType<typeof useGameSave>;
  onCancel: () => void;
}

/** The games form: general information, branding and palette, and whether players see the game. */
export function GameForm({ mode, original, form, saver, onCancel }: GameFormProps) {
  const { draft } = form;
  const isValid = draft.slug.trim().length > 0 && draft.name.trim().length > 0;
  // A new game is always worth saving; an edited one once something changed.
  const isDirty = mode === "create" || (original !== null && (form.iconFile !== null || isDraftChanged(draft, draftOf(original))));
  /** The form's error for `field`, if any. */
  const errorOf = (field: string): string | undefined => saver.errors?.[field]?.[0];
  return (
    <form onSubmit={(event) => { void saver.submit(event); }} className="flex flex-col gap-8">
      <GameGeneralFields mode={mode} form={form} errorOf={errorOf} />
      <GameBranding form={form} errorOf={errorOf} />
      <GameActiveField isActive={draft.active} onChange={(active) => { form.update({ active }); }} />
      <GameFormActions mode={mode} isSubmitting={saver.isSubmitting} canSubmit={isValid && isDirty} onCancel={onCancel} />
    </form>
  );
}
