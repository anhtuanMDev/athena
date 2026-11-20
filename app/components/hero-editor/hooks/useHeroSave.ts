import { useState } from "react";
import { useNavigate } from "react-router";

import { publishedToast } from "~/components/NotifyPlayers";
import { useToast } from "~/components/ToastProvider";

import { createHero, previewHero } from "../utils/saveHero";

import type { HeroPreview, HeroSave, StoredHero } from "../types";
import type { useHeroForm } from "./useHeroForm";

interface HeroSaveSetup {
  game: string;
  stored?: StoredHero;
  form: ReturnType<typeof useHeroForm>;
  shouldNotify: boolean;
  setSubmitError: (message: string | null) => void;
}

/** New's Create (the hero is added) and Edit's Preview (the save is worked out and shown first). */
export function useHeroSave({ game, stored, form, shouldNotify, setSubmitError }: HeroSaveSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<HeroPreview | null>(null);

  const create = async (save: HeroSave) => {
    const outcome = await createHero(save, shouldNotify);
    if ("detail" in outcome) {
      setSubmitError(outcome.detail);
      toast.error(outcome.toast);
      return;
    }
    publishedToast(toast, `Hero ${String(save.formData.name)} created successfully!`, outcome.push);
    await navigate(`/${game}/heroes`);
  };

  const onSubmit = async (formData: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);
    const save: HeroSave = { game, formData, fields: form.fields, schema: form.schema, portraits: form.portraits, abilityIcons: form.abilityIcons, getValue: (path) => form.methods.getValues(path) };
    try {
      if (stored) {
        setPreview(await previewHero(save, stored));
      } else {
        await create(save);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitError(message);
      toast.error(stored ? `Validation Failed: ${message}` : `Failed to create hero: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return { isSubmitting, preview, closePreview: () => { setPreview(null); }, onSubmit };
}
