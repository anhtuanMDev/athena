// What pressing Save does in the screen editor, decided apart from the page.

/** Why the editor won't save: it would check the screen against data it couldn't read, and write what it found. */
export const PARTIAL_LOAD_REASON = "Saving is off until everything loads. Reload the page.";

/** The editor's state when Save is pressed (the button or ⌘S). */
export interface SaveState {
  isDirty: boolean;
  isSubmitting: boolean;
  /** The game's data that couldn't be read (ScreenData.failed). */
  failed: readonly string[];
  /** Problems that stop the save. */
  blockingCount: number;
}

/** What a save does: nothing to save, refused with a reason, stopped at the problems, or written. */
export type SaveStep = { kind: "nothing" } | { kind: "refused"; reason: string } | { kind: "problems" } | { kind: "write" };

export function saveStep({ isDirty, isSubmitting, failed, blockingCount }: SaveState): SaveStep {
  if (!isDirty || isSubmitting) {
    return { kind: "nothing" };
  }
  if (failed.length > 0) {
    return { kind: "refused", reason: PARTIAL_LOAD_REASON };
  }
  return blockingCount > 0 ? { kind: "problems" } : { kind: "write" };
}
