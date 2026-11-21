import { DiffView } from "~/components/DiffView";
import { NormalizedNote } from "~/components/record-form/NormalizedNote";
import { Button } from "~/components/ui/button";

import type { HeroPreview } from "./types";
import type { SubmitEvent } from "react";

interface HeroReviewProps {
  preview: HeroPreview;
  submitError: string | null;
  isCommitting: boolean;
  onCancel: () => void;
  onCommit: () => Promise<void>;
}

/** Edit's review: what the save changes, then commit or back to the form. */
export function HeroReview({ preview, submitError, isCommitting, onCancel, onCommit }: HeroReviewProps) {
  const uploads = [...preview.portraitUploads, ...preview.abilityUploads];
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCommit();
  };
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ink tracking-tight">Review Changes</h2>
      <DiffView diffs={preview.edits} uploads={uploads.map((upload) => upload.path)} />
      <NormalizedNote fields={preview.normalized} />
      {submitError !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{submitError}</div>}
      <form onSubmit={onSubmit} className="flex gap-4 pt-4 border-t border-border">
        <input type="hidden" name="_heroJson" value={preview.heroJson} />
        <Button type="submit" disabled={isCommitting || (preview.diffs.length === 0 && uploads.length === 0)} className="shadow-lg w-40">
          {isCommitting ? "Committing..." : "Confirm Commit"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="w-32 bg-surface-raised">
          Cancel
        </Button>
      </form>
    </div>
  );
}
