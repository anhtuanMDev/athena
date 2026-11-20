import { useState } from "react";
import { useNavigate } from "react-router";

import { publishedToast } from "~/components/NotifyPlayers";
import { useToast } from "~/components/ToastProvider";
import { abilityLists, applyAbilityIcons } from "~/lib/ability-icons";
import { isConflictError } from "~/lib/github";

import { createMode, updateMode } from "../utils/saveMode";

import type { ModeRecordSchema, StoredMode } from "../types";
import type { FieldErrors, UseFormReturn } from "react-hook-form";
import type { ImageEntry } from "~/components/MultiImageUploadField";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface ModeSaveSetup {
  game: string;
  stored?: StoredMode;
  methods: UseFormReturn<Record<string, unknown>>;
  fields: DynamicField[];
  schema: ModeRecordSchema;
  abilityIcons: Record<string, ImageEntry[]>;
  shouldNotify: boolean;
}

/** Saving a mode: New adds it, Edit writes over its file; either way, a refusal or error shows on the page. */
export function useModeSave(setup: ModeSaveSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { game, stored } = setup;

  const save = async (formData: Record<string, unknown>) => {
    const { uploads } = applyAbilityIcons(formData, (path) => setup.methods.getValues(path), abilityLists(setup.fields), setup.abilityIcons, `${game}/modes/${String(formData.id)}`);
    const parsed = setup.schema.parse(formData) as Record<string, unknown>;
    const request = { game, parsed, uploads, schema: setup.schema };
    const outcome = stored ? await updateMode(request, stored) : await createMode(request, setup.shouldNotify);
    if ("detail" in outcome) {
      setSubmitError(outcome.detail);
      if (outcome.toast !== undefined) {
        toast.error(outcome.toast);
      }
      return;
    }
    const done = `Mode ${String(parsed.name)} ${stored ? "updated" : "created"} successfully!`;
    if ("push" in outcome) {
      publishedToast(toast, done, outcome.push);
    } else if (outcome.note?.kept === true) {
      toast.warning(`${done} ${outcome.note.message}`);
    } else {
      toast.success(outcome.note ? `${done} ${outcome.note.message}` : done);
    }
    await navigate(`/${game}/modes`);
  };

  const onSubmit = async (formData: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await save(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitError(message);
      toast.error(stored && isConflictError(error) ? message : `Failed to ${stored ? "update" : "create"} mode: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // A refusal no field shows (the strict check's unknown keys): said on the page, not silently ignored.
  const onInvalid = (errors: FieldErrors) => {
    const root = errors[""]?.message;
    setSubmitError(typeof root === "string" ? `This mode can't be saved: ${root}` : null);
  };

  return { isSubmitting, submitError, onSubmit, onInvalid };
}
