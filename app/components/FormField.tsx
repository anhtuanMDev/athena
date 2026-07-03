import TextField from "@mui/material/TextField";
import type { TextFieldProps } from "@mui/material/TextField";

type FormFieldProps = TextFieldProps & { label: string };

export function FormField({ label, slotProps, ...props }: FormFieldProps) {
  return (
    <TextField
      label={label}
      variant="outlined"
      size="small"
      fullWidth
      slotProps={{ ...slotProps }}
      {...props}
    />
  );
}
