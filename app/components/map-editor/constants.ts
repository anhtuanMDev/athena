/** The save button's words, while saving and not. */
export const SAVE_LABELS = {
  new: { busy: "Creating...", idle: "Create Map" },
  edit: { busy: "Saving...", idle: "Save Changes" },
} as const;

/** The bar of buttons over the form and the one under it. */
export const ACTION_BARS = {
  top: "flex justify-between items-center border-b border-border pb-4 mb-4",
  bottom: "pt-4 flex items-center justify-between",
} as const;
