import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";

import { SUBMIT } from "./constants";

interface HeroTopActionsProps {
  game: string;
  stage: "new" | "edit";
  isSubmitting: boolean;
  /** Edit: whether there's anything to preview. */
  hasChanges: boolean;
}

/** Cancel and the submit button above the form. */
export function HeroTopActions({ game, stage, isSubmitting, hasChanges }: HeroTopActionsProps) {
  const navigate = useNavigate();
  const submit = SUBMIT[stage];
  return (
    <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
      <Button type="button" variant="ghost" onClick={() => { void navigate(`/${game}/heroes`); }}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSubmitting || (stage === "edit" && !hasChanges)} className={submit.className}>
        {isSubmitting ? submit.busy : submit.idle}
      </Button>
    </div>
  );
}
