import Drawer from "@mui/material/Drawer";
import { X } from "lucide-react";

import { DRAWER_PAPER } from "./constants";
import { GameForm } from "./GameForm";

import type { useGameDraft } from "./hooks/useGameDraft";
import type { useGameSave } from "./hooks/useGameSave";
import type { GameFormMode } from "./types";
import type { Game } from "~/schemas/game";

interface GameDrawerProps {
  /** What the drawer does; null when it's closed. */
  mode: GameFormMode | null;
  /** The game it edits, as it was opened. */
  original: Game | null;
  form: ReturnType<typeof useGameDraft>;
  saver: ReturnType<typeof useGameSave>;
  onClose: () => void;
}

/** The drawer that adds or edits a game: its title, the form's own errors, and the form. */
export function GameDrawer({ mode, original, form, saver, onClose }: GameDrawerProps) {
  const formErrors = saver.errors?._form;
  return (
    <Drawer open={mode !== null} anchor="right" onClose={onClose} slotProps={{ paper: DRAWER_PAPER }}>
      <div className="flex h-full flex-col">
        <div className="px-6 py-6 border-b border-border flex items-center justify-between">
          <h2 id="game-drawer-title" className="text-xl font-bold text-ink">
            {mode === "edit" ? "Edit Game" : "Add Game"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
          {formErrors && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-4">{formErrors.join(", ")}</div>}
          <GameForm mode={mode ?? "create"} original={original} form={form} saver={saver} onCancel={onClose} />
        </div>
      </div>
    </Drawer>
  );
}
