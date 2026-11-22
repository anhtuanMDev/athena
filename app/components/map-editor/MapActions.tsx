import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

import { ACTION_BARS, SAVE_LABELS } from "./constants";

import type { MapStage } from "./types";

interface MapActionsProps {
  game: string;
  stage: MapStage;
  /** The bar over the form (Cancel goes back) or under it (Cancel goes to the list; Save waits for a valid form). */
  place: "top" | "bottom";
  isSubmitting: boolean;
  /** Edit: whether there's anything to save. */
  hasChanges: boolean;
  isValid: boolean;
}

/** Whether the save button is off: while saving, while Edit has nothing to save, and under the form until it's valid. */
function isSaveOff({ stage, place, isSubmitting, hasChanges, isValid }: Omit<MapActionsProps, "game">): boolean {
  const isUnchanged = stage === "edit" && !hasChanges;
  const isInvalidBelow = place === "bottom" && !isValid;
  return isSubmitting || isUnchanged || isInvalidBelow;
}

/** Cancel and the save button. Edit's is off until something changed, and the top one says so. */
export function MapActions(props: MapActionsProps) {
  const { game, stage, place, isSubmitting, hasChanges } = props;
  const navigate = useNavigate();
  const cancel = () => {
    if (place === "top") {
      window.history.back();
      return;
    }
    void navigate(`/${game}/maps`);
  };
  const save = (
    <Button type="submit" disabled={isSaveOff(props)} className={place === "bottom" && stage === "edit" ? "shadow-lg w-full sm:w-auto" : "shadow-lg"}>
      {isSubmitting ? SAVE_LABELS[stage].busy : SAVE_LABELS[stage].idle}
    </Button>
  );
  const isUnchangedNoted = place === "top" && stage === "edit" && !hasChanges;
  return (
    <div className={ACTION_BARS[place]}>
      <Button type="button" variant="ghost" onClick={cancel}>
        Cancel
      </Button>
      {isUnchangedNoted ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">No changes to save yet.</span>
          {save}
        </div>
      ) : (
        save
      )}
    </div>
  );
}
