import { useToast } from "~/components/ToastProvider";
import { updateFile } from "~/lib/github";
import { saveStep } from "~/lib/screen-save";

import { saveErrorMessage, savedContent } from "./utils/save-content";

import type { RefObject } from "react";
import type { ScreenFile } from "~/lib/screen-model";

interface ScreenSaveOptions {
  /** The file as loaded (its other keys are kept), the screen as edited, and the game's data that couldn't be read. */
  draft: { file: unknown; screen: ScreenFile | null; failed: readonly string[] };
  /** Where it's saved: its path, its id and the sha it was read at. */
  target: { path: string; id: string; sha: string | undefined };
  /** Whether there's anything to save, whether a save is running, and how many problems stop it. */
  state: { isDirty: boolean; isSubmitting: boolean; blockingCount: number };
  /** The editor's own flags: a save was tried (required props then show), and one is running. */
  flags: { setAttempted: (value: boolean) => void; setSubmitting: (value: boolean) => void };
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSaved: (snapshot: string, sha: string | null) => void;
}

/**
 * Saving the screen: refused with its reason while some of the game's data
 * couldn't be read (saveStep); stopped, with the problems listed and focused,
 * while any stop it; else written over the sha it was read at, so a change
 * made meanwhile on GitHub surfaces as a conflict.
 */
export function useScreenSave({ draft, target, state, flags, headingRef, onSaved }: ScreenSaveOptions): () => Promise<void> {
  const { success: toastSuccess, error: toastError } = useToast();

  const write = async (screen: ScreenFile) => {
    flags.setSubmitting(true);
    try {
      const sha = await updateFile(target.path, savedContent(draft.file, screen), target.sha ?? "", `Update screen: ${target.id}`);
      onSaved(JSON.stringify(screen), sha);
      flags.setAttempted(false);
      toastSuccess("Screen saved. The app picks it up on its next config refresh.");
    } catch (error) {
      toastError(saveErrorMessage(error));
    } finally {
      flags.setSubmitting(false);
    }
  };

  const save = async () => {
    const { screen } = draft;
    const step = saveStep({ ...state, failed: draft.failed });
    if (!screen || step.kind === "nothing") {
      return;
    }
    if (step.kind === "refused") {
      toastError(step.reason);
      return;
    }
    flags.setAttempted(true);
    if (step.kind === "problems") {
      requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    await write(screen);
  };

  return save;
}
