import { Button } from "~/components/ui/button";

import { SUBMIT_LABELS } from "./constants";

import type { GameFormMode } from "./types";

interface GameFormActionsProps {
  mode: GameFormMode;
  isSubmitting: boolean;
  canSubmit: boolean;
  onCancel: () => void;
}

/** Cancel, and Create Game or Save Changes. */
export function GameFormActions({ mode, isSubmitting, canSubmit, onCancel }: GameFormActionsProps) {
  return (
    <div className="flex justify-end gap-3 pt-6 mt-8 border-t border-border">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting || !canSubmit}>
        {isSubmitting ? "Saving…" : SUBMIT_LABELS[mode]}
      </Button>
    </div>
  );
}
