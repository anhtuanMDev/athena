import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

interface ModeActionsProps {
  game: string;
  stage: "new" | "edit";
  isSubmitting: boolean;
  /** Edit: whether there's anything to save. */
  hasChanges: boolean;
}

const LABELS = {
  new: { busy: "Creating...", idle: "Create Mode" },
  edit: { busy: "Saving...", idle: "Save Changes" },
} as const;

/** Cancel and the save button. Edit's is off until something changed, and says so. */
export function ModeActions({ game, stage, isSubmitting, hasChanges }: ModeActionsProps) {
  const navigate = useNavigate();
  const isUnchanged = stage === "edit" && !hasChanges;
  return (
    <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
      <Button type="button" variant="ghost" onClick={() => { void navigate(`/${game}/modes`); }}>
        Cancel
      </Button>
      <div className="flex items-center gap-3">
        {isUnchanged && <span className="text-xs text-ink-muted">No changes to save yet.</span>}
        <Button type="submit" disabled={isSubmitting || isUnchanged} className="shadow-lg w-40">
          {isSubmitting ? LABELS[stage].busy : LABELS[stage].idle}
        </Button>
      </div>
    </div>
  );
}
