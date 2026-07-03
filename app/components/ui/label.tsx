import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export function Label({ children, htmlFor, className = "", ...props }: { children?: ReactNode; htmlFor?: string; className?: string; [key: string]: unknown }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      variant="body2"
      className={className}
      sx={{ fontWeight: 500, mb: 0.5, display: "block" }}
      {...props}
    >
      {children}
    </Typography>
  );
}
