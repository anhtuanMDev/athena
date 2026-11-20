import type { FocusEvent, FocusEventHandler } from "react";

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

interface FocusTargets {
  onFocus?: FocusEventHandler<FieldElement>;
  onBlur?: FocusEventHandler<FieldElement>;
  /** Floats the label (true) or lets MUI decide (undefined). */
  setShrink: (shrink: true | undefined) => void;
}

/**
 * A FormField's focus handlers, for its input slot: they float the label while
 * the field is focused or filled, then call the field's own. MUI applies the
 * slot's handlers after the field's onFocus and onBlur, so without that call
 * react-hook-form's onBlur (from register) never runs and the field is never
 * marked touched.
 */
export function focusHandlers({ onFocus, onBlur, setShrink }: FocusTargets): { onFocus: FocusEventHandler<FieldElement>; onBlur: FocusEventHandler<FieldElement> } {
  return {
    onFocus: (event: FocusEvent<FieldElement>) => {
      setShrink(true);
      onFocus?.(event);
    },
    onBlur: (event: FocusEvent<FieldElement>) => {
      setShrink(event.target.value ? true : undefined);
      onBlur?.(event);
    },
  };
}
