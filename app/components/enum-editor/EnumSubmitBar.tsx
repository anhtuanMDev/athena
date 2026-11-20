import { Button } from "~/components/ui/button";
import { reviewButton } from "~/lib/enum-form";

import { SUBMIT_ROWS } from "./constants";

interface EnumSubmitBarProps {
  /** Above the fields, or below them. */
  place: "top" | "bottom";
  stage: "new" | "edit";
  isSubmitting: boolean;
  /** Edit: whether there's anything to review. */
  hasChanges: boolean;
}

/** New's Create button, or Edit's Review button with why it's off when it is. */
export function EnumSubmitBar({ place, stage, isSubmitting, hasChanges }: EnumSubmitBarProps) {
  const button = stage === "edit" ? reviewButton({ hasChanges, isSubmitting }) : { isDisabled: isSubmitting, label: isSubmitting ? "Creating..." : "Create Enum", note: null };
  return (
    <div className={SUBMIT_ROWS[place]}>
      {button.note !== null && <span className="text-xs text-ink-muted">{button.note}</span>}
      <Button type="submit" variant="default" disabled={button.isDisabled}>
        {button.label}
      </Button>
    </div>
  );
}
