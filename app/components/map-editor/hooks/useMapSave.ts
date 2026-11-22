import { useState } from "react";
import { useNavigate } from "react-router";

import { publishedToast } from "~/components/NotifyPlayers";
import { useToast } from "~/components/ToastProvider";
import { isConflictError } from "~/lib/github";

import { createMap, updateMap } from "../utils/saveMap";

import type { MapRecordSchema, StoredMap } from "../types";

interface MapSaveSetup {
  game: string;
  stored?: StoredMap;
  schema: MapRecordSchema;
  shouldNotify: boolean;
}

/** The toast for an edit that failed: a conflict says itself; anything else says what failed. */
const editFailure = (error: unknown, message: string) => (isConflictError(error) ? message : `Failed to save: ${message}`);

/** Saving a map: New adds it, Edit writes over its file; either way, a refusal or error shows on the page. */
export function useMapSave({ game, stored, schema, shouldNotify }: MapSaveSetup) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const save = async (formData: Record<string, unknown>) => {
    const parsed = schema.parse(formData) as Record<string, unknown>;
    const outcome = stored ? await updateMap({ game, parsed, schema }, stored) : await createMap({ game, parsed, schema }, shouldNotify);
    if ("detail" in outcome) {
      setSubmitError(outcome.detail);
      if (outcome.toast !== undefined) {
        toast.error(outcome.toast);
      }
      return;
    }
    const done = `Map ${String(parsed.name)} ${stored ? "updated" : "created"} successfully!`;
    if ("push" in outcome) {
      publishedToast(toast, done, outcome.push);
    } else {
      toast.success(done);
    }
    await navigate(`/${game}/maps`);
  };

  const onSubmit = async (formData: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await save(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitError(message);
      toast.error(stored ? editFailure(error, message) : `Failed to create map: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return { isSubmitting, submitError, onSubmit };
}
