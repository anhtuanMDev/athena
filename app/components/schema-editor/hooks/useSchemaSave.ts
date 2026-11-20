import { useState } from "react";
import { useNavigate } from "react-router";

import { useToast } from "~/components/ToastProvider";
import { clearDataCache } from "~/lib/use-data";

import type { SaveRefusal } from "../types";

/**
 * A schema's save as both pages run it: busy while it runs, its refusal or
 * error on the page and in a toast, and back to the schemas once it's done.
 * `save` resolves to the success toast's text, or a refusal.
 */
export function useSchemaSave(game: string) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [isSubmitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const refuse = ({ detail, toast }: SaveRefusal) => {
    setCommitError(detail);
    if (toast !== undefined) {
      toastError(toast);
    }
  };

  const run = async (save: () => Promise<string | SaveRefusal>) => {
    setSubmitting(true);
    setCommitError(null);
    try {
      const outcome = await save();
      if (typeof outcome !== "string") {
        refuse(outcome);
        return;
      }
      toastSuccess(outcome);
      clearDataCache();
      await navigate(`/${game}/schemas`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCommitError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return { isSubmitting, commitError, setCommitError, run };
}
