import { isConflictError } from "~/lib/github";

import type { ScreenFile } from "~/lib/screen-model";

/** What a save writes: the file as loaded with the edited screen over it, less its id (the file's name) and unset keys. */
export function savedContent(file: unknown, screen: ScreenFile): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(file as Record<string, unknown>), ...screen };
  return Object.fromEntries(Object.entries(merged).filter(([key, value]) => key !== "id" && value !== undefined));
}

/** Why a save failed, as the toast says it. */
export function saveErrorMessage(error: unknown): string {
  if (isConflictError(error)) {
    return "This screen changed on GitHub after you opened it. Reload the page to get the latest version, then redo your changes.";
  }
  return error instanceof Error ? error.message : String(error);
}
