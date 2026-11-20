import { useState } from "react";
import { useNavigate } from "react-router";

import { useToast } from "~/components/ToastProvider";
import { formErrorLines } from "~/lib/enum-form";

import { createEnum, reviewEnum } from "../utils/saveEnum";

import type { EnumPreview, IconPicks, StoredEnum } from "../types";
import type { FieldErrors } from "react-hook-form";
import type { GlobalEnum } from "~/schemas/enum";

interface EnumSaveSetup {
  game: string;
  stored?: StoredEnum;
  /** The form's key for each option, in order. */
  keys: string[];
  picks: IconPicks;
  setSubmitError: (message: string | null) => void;
}

/** New's Create (the enum is added) and Edit's Review (the save is worked out and shown first). */
export function useEnumSave({ game, stored, keys, picks, setSubmitError }: EnumSaveSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<EnumPreview | null>(null);

  const onSubmit = async (data: GlobalEnum) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (stored) {
        setPreview(reviewEnum({ game, data, keys, picks }, stored));
        return;
      }
      await createEnum({ game, data, keys, picks });
      toast.success(`Enum ${data.name} created successfully!`);
      await navigate(`/${game}/enums`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error";
      setSubmitError(message);
      toast.error(stored ? `Validation Failed: ${message}` : `Failed to create enum: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Review stays on with wrong values: a click says what to fix, those no field shows included.
  const onInvalid = (errors: FieldErrors<GlobalEnum>) => {
    setSubmitError(`Fix these before reviewing: ${formErrorLines(errors).join("; ")}`);
  };

  return { isSubmitting, preview, closePreview: () => { setPreview(null); }, onSubmit, onInvalid };
}
