import { useState } from "react";

import { readFileBase64, saveGame } from "~/lib/games-save";

import type { FormErrors } from "../types";
import type { useGameDraft } from "./useGameDraft";
import type { SubmitEvent } from "react";

interface GameSaveSetup {
  form: ReturnType<typeof useGameDraft>;
  /** The slug of the game being edited; null for a new game. */
  editing: string | null;
  onSaved: () => void;
}

/** The games form's save (app/lib/games-save.ts): checked first, then games.json and a picked icon in one commit. */
export function useGameSave({ form, editing, onSaved }: GameSaveSetup) {
  const [isSubmitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors | null>(null);

  const save = async () => {
    const picked = form.iconFile ? { name: form.iconFile.name, base64: await readFileBase64(form.iconFile) } : undefined;
    const outcome = await saveGame({ draft: form.draft, editing, ...(picked && { iconFile: picked }) });
    if ("saved" in outcome) {
      onSaved();
      return;
    }
    if (outcome.tab) {
      form.setTab(outcome.tab);
    }
    setErrors(outcome.errors);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors(null);
    try {
      await save();
    } catch (err) {
      setErrors({ _form: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setSubmitting(false);
    }
  };

  return { isSubmitting, errors, setErrors, submit };
}
