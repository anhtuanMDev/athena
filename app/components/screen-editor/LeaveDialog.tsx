import Dialog from "@mui/material/Dialog";

import { Button } from "~/components/ui/button";

import type { Blocker } from "react-router";

interface LeaveDialogProps {
  blocker: Blocker;
}

/** Asks before leaving with unsaved changes. */
export function LeaveDialog({ blocker }: LeaveDialogProps) {
  return (
    <Dialog
      open={blocker.state === "blocked"}
      onClose={() => blocker.reset?.()}
      aria-labelledby="leave-screen-title"
      aria-describedby="leave-screen-description"
      slotProps={{ paper: { sx: { width: "100%", maxWidth: 420, m: 2, borderRadius: "16px", border: "1px solid var(--ds-border)" } } }}
    >
      <div className="p-6">
        <h2 id="leave-screen-title" className="text-lg font-semibold text-ink">
          Leave without saving?
        </h2>
        <p id="leave-screen-description" className="mt-1 text-sm text-ink-muted">
          Your changes to this screen haven&apos;t been saved to GitHub and will be lost.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" autoFocus onClick={() => blocker.reset?.()}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
            Discard changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
