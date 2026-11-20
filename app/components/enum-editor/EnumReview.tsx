import { DiffView } from "~/components/DiffView";
import { Button } from "~/components/ui/button";

import type { EnumPreview } from "./types";
import type { SubmitEvent } from "react";

interface EnumReviewProps {
  preview: EnumPreview;
  submitError: string | null;
  isCommitting: boolean;
  onEditAgain: () => void;
  onCommit: () => Promise<void>;
}

/** Edit's review: what the save changes, then back to the form or commit. */
export function EnumReview({ preview, submitError, isCommitting, onEditAgain, onCommit }: EnumReviewProps) {
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCommit();
  };
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ink tracking-tight">Review Changes</h2>
      <DiffView diffs={preview.diffs} uploads={preview.pictures.map((picture) => picture.path)} />
      {submitError !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{submitError}</div>}
      <form onSubmit={onSubmit} className="flex gap-4 pt-4 border-t border-border">
        <input type="hidden" name="_enumJson" value={preview.enumJson} />
        <Button type="button" variant="outline" onClick={onEditAgain}>
          Edit Again
        </Button>
        <Button type="submit" variant="default" disabled={isCommitting || (preview.diffs.length === 0 && preview.pictures.length === 0)}>
          {isCommitting ? "Saving to GitHub..." : "Commit Changes"}
        </Button>
      </form>
    </div>
  );
}
