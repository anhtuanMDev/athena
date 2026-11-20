import { Copy } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router";

import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";

import { BOTTOM_ROW, SUBMIT } from "./constants";
import { HeroErrorList } from "./HeroErrorList";

interface HeroBottomBarProps {
  game: string;
  stage: "new" | "edit";
  isSubmitting: boolean;
  /** Edit: whether there's anything to preview. */
  hasChanges: boolean;
}

/** Under the form: what the check refused, Cancel, Copy JSON and the submit button. */
export function HeroBottomBar({ game, stage, isSubmitting, hasChanges }: HeroBottomBarProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { getValues } = useFormContext<Record<string, unknown>>();
  const submit = SUBMIT[stage];
  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(getValues(), null, 2));
    toast.success("Form JSON copied to clipboard!");
  };
  return (
    <div className={BOTTOM_ROW[stage]}>
      <HeroErrorList />
      <div className="flex justify-between items-center">
        <Button type="button" variant="ghost" onClick={() => { void navigate(`/${game}/heroes`); }}>
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="gap-2" onClick={copyJson}>
            <Copy className="w-4 h-4" />
            Copy JSON
          </Button>
          <Button type="submit" disabled={isSubmitting || (stage === "edit" && !hasChanges)} className={submit.className}>
            {isSubmitting ? submit.busy : submit.idle}
          </Button>
        </div>
      </div>
    </div>
  );
}
