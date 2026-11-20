// What the enum editor (app/components/enum-editor) works out without React:
// the option ids a save refuses, a param's id from its label, what the Review
// button says, and the reasons a check refused the form.

/** The option ids used more than once, as the save refuses them: "Duplicate option IDs: a, b". */
export function duplicateOptionIds(ids: readonly string[]): string | null {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length === 0) {
    return null;
  }
  return `Duplicate option ID${duplicates.length > 1 ? "s" : ""}: ${[...new Set(duplicates)].join(", ")}`;
}

/** A new param's id from its label: "Damage Multiplier" → "damage_multiplier". */
export function paramIdFromLabel(label: string): string {
  return label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/(^_|_$)/g, "");
}

/** Edit's Review button: off only with nothing to review, or while working, and then it says why. */
export interface ReviewButton {
  isDisabled: boolean;
  label: string;
  /** Why it's off, shown beside it. */
  note: string | null;
}

export function reviewButton({ hasChanges, isSubmitting }: { hasChanges: boolean; isSubmitting: boolean }): ReviewButton {
  // A wrong value doesn't turn it off: a click shows what to fix (formErrorLines).
  return {
    isDisabled: !hasChanges || isSubmitting,
    label: isSubmitting ? "Processing..." : "Review Changes",
    note: hasChanges ? null : "No changes to review yet.",
  };
}

/** react-hook-form's own keys on a reason, beside the message. */
const ERROR_KEYS = new Set(["type", "message", "ref", "types"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Every reason a check refused the form, "path: message", those no field shows included. */
export function formErrorLines(errors: unknown, path = ""): string[] {
  if (!isRecord(errors)) {
    return [];
  }
  const own = typeof errors.message === "string" && typeof errors.type === "string" ? [`${path}: ${errors.message}`] : [];
  const nested = Object.entries(errors)
    .filter(([key]) => !ERROR_KEYS.has(key))
    .flatMap(([key, value]) => formErrorLines(value, path === "" ? key : `${path}.${key}`));
  return [...own, ...nested];
}
