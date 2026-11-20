import { useState } from "react";
import { useNavigate } from "react-router";

import { useToast } from "~/components/ToastProvider";
import { isConflictError } from "~/lib/github";

import { commitHero } from "../utils/saveHero";

import type { HeroPreview, HeroRecordSchema, StoredHero } from "../types";

interface HeroCommitSetup {
  game: string;
  stored?: StoredHero;
  preview: HeroPreview | null;
  schema: HeroRecordSchema;
  setSubmitError: (message: string | null) => void;
}

/** Edit's Confirm Commit: the reviewed hero saved over its file, then the pictures it no longer uses removed. */
export function useHeroCommit({ game, stored, preview, schema, setSubmitError }: HeroCommitSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isCommitting, setCommitting] = useState(false);

  const save = async (reviewed: HeroPreview, loaded: StoredHero) => {
    const outcome = await commitHero({ game, stored: loaded, preview: reviewed, schema });
    if ("refusal" in outcome) {
      setSubmitError(outcome.refusal);
      toast.error("Validation failed on commit");
      return;
    }
    const done = `Hero ${outcome.name} updated successfully!`;
    if (outcome.note?.kept === true) {
      toast.warning(`${done} ${outcome.note.message}`);
    } else {
      toast.success(outcome.note ? `${done} ${outcome.note.message}` : done);
    }
    await navigate(`/${game}/heroes`);
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
