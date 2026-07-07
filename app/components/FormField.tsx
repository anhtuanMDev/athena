import { forwardRef } from "react";
import TextField from "@mui/material/TextField";
import type { TextFieldProps } from "@mui/material/TextField";

export type FormFieldProps = TextFieldProps & { label: string };

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, slotProps, ...props }, ref) => {
    return (
      <TextField
        label={label}
        variant="outlined"
        size="small"
        fullWidth
        autoComplete="off"
        slotProps={{
          ...slotProps,
          htmlInput: {
            step: props.type === "number" ? "any" : undefined,
            ...slotProps?.htmlInput,
          },
        }}
        inputRef={ref}
        {...props}
      />
    );
  }
);

FormField.displayName = "FormField";
