/** New's Create button and Edit's Preview button. */
export const SUBMIT = {
  new: { busy: "Creating...", idle: "Create Hero", className: "shadow-lg w-40" },
  edit: { busy: "Processing...", idle: "Preview Changes", className: "shadow-lg" },
} as const;

/** The row under the form: New's, and Edit's set off by a rule. */
export const BOTTOM_ROW = {
  new: "pt-6",
  edit: "pt-6 border-t border-border mt-8",
} as const;
