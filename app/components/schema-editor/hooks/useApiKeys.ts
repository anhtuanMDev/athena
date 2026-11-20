import { useState } from "react";

import { useToast } from "~/components/ToastProvider";
import { api } from "~/lib/github";
import { fieldKeysOf, referenceListPath } from "~/lib/schema-fields";

import type { ApiKeys } from "../types";

/**
 * "Fetch Fields" for reference fields: the keys of the first record the
 * endpoint lists, offered as the field's value and label keys. Read through
 * api(), so an ended session asks to sign in again (ReauthModal) and the
 * page keeps its edits.
 */
export function useApiKeys(game: string): ApiKeys {
  const { success: toastSuccess, error: toastError } = useToast();
  const [keys, setKeys] = useState<Partial<Record<number, string[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<number, boolean>>>({});

  const fetchKeys = async (index: number, endpoint: string) => {
    const path = referenceListPath(endpoint, game);
    if (path === null) {
      toastError("Failed to fetch API endpoint");
      return;
    }
    setLoading((current) => ({ ...current, [index]: true }));
    try {
      const found = fieldKeysOf(await api<unknown>("GET", path));
      if (found === null) {
        toastError("API returned empty list or non-objects");
        return;
      }
      setKeys((current) => ({ ...current, [index]: found }));
      toastSuccess(`Loaded ${String(found.length)} fields from API`);
    } catch (error) {
      toastError(error instanceof Error ? `Failed to fetch API endpoint: ${error.message}` : "Failed to fetch API endpoint");
    } finally {
      setLoading((current) => ({ ...current, [index]: false }));
    }
  };

  return { keys, loading, fetchKeys };
}
