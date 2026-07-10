import { forwardRef, useState, useCallback } from "react";
import TextField from "@mui/material/TextField";
import type { TextFieldProps } from "@mui/material/TextField";

export type FormFieldProps = TextFieldProps & { label: string };

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, slotProps, ...props }, ref) => {
    // Shrink state: undefined = let MUI decide, true = force float
    const [shrink, setShrink] = useState<true | undefined>(() => {
      if (props.value !== undefined)
        return (Boolean(props.value) || props.value === 0) ? true : undefined;
      if (props.defaultValue !== undefined)
        return Boolean(props.defaultValue) ? true : undefined;
      return undefined;
    });

    // Merged ref: forwards to RHF's ref AND checks DOM value after RHF sets it
    const inputRef = useCallback(
      (el: HTMLInputElement | null) => {
        // Forward to parent ref (required for RHF register())
        if (typeof ref === "function") ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;

        if (el) {
          // RHF sets el.value synchronously in its own ref callback.
          // We use a microtask to read it after that callback completes.
          Promise.resolve().then(() => {
            if (el.value) setShrink(true);
          });
        }
      },
      [ref],
    );

    return (
      <TextField
        label={label}
        variant="outlined"
        size="small"
        fullWidth
        autoComplete="off"
        inputRef={inputRef}
        slotProps={{
          ...slotProps,
          inputLabel: {
            shrink,
            ...(slotProps as any)?.inputLabel,
          },
          input: {
            onFocus: () => setShrink(true),
            onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
              setShrink(e.target.value ? true : undefined);
            },
            ...(slotProps as any)?.input,
          },
          htmlInput: {
            step: props.type === "number" ? "any" : undefined,
            ...slotProps?.htmlInput,
          },
        }}
        {...props}
      />
    );
  },
);

FormField.displayName = "FormField";

