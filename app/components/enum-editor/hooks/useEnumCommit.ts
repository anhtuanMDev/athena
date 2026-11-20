import { useState } from "react";
import { useNavigate } from "react-router";

import { useToast } from "~/components/ToastProvider";
import { isConflictError } from "~/lib/github";

import { commitEnum } from "../utils/saveEnum";

import type { EnumPreview, StoredEnum } from "../types";

interface EnumCommitSetup {
  game: string;
  stored?: StoredEnum;
  preview: EnumPreview | null;
  setSubmitError: (message: string | null) => void;
}

/** Edit's Commit: the reviewed enum saved over its file, then the icons it no longer uses removed. */
export function useEnumCommit({ game, stored, preview, setSubmitError }: EnumCommitSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCommitting, setCommitting] = useState(false);

  const save = async (reviewed: EnumPreview, loaded: StoredEnum) => {
    const outcome = await commitEnum(game, loaded, reviewed);
    if (outcome === null) {
      setSubmitError("Enum data failed validation on commit");
      toast.error("Validation failed on commit");
      return;
    }
    const done = `Enum ${outcome.name} updated successfully!`;
    if (outcome.note?.kept === true) {
      toast.warning(`${done} ${outcome.note.message}`);
    } else {
      toast.success(outcome.note ? `${done} ${outcome.note.message}` : done);
    }
    await navigate(`/${game}/enums`);
  };

  const commit = async () => {
    if (!preview || !stored) {
      return;
    }
    setCommitting(true);
    setSubmitError(null);
    try {
      await save(preview, stored);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error";
      setSubmitError(message);
      toast.error(isConflictError(error) ? message : `Failed to save: ${message}`);
    } finally {
      setCommitting(false);
    }
  };

  return { isCommitting, commit };
}
