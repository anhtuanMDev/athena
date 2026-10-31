import MuiButton from "@mui/material/Button";
import type { ButtonProps as MuiButtonProps } from "@mui/material/Button";
import { Link, type LinkProps } from "react-router";

type ShadcnVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

const variantMap: Record<string, MuiButtonProps["variant"]> = {
  default: "contained",
  secondary: "contained",
  destructive: "contained",
  outline: "outlined",
  ghost: "text",
  link: "text",
};

const colorMap: Record<string, MuiButtonProps["color"]> = {
  default: "primary",
  secondary: "inherit",
  destructive: "error",
  ghost: "inherit",
};

// DESIGN.md: ghost buttons have no fill, Quiet Ink text, Raised Panel on hover.
const ghostSx = {
  color: "var(--ds-ink-muted)",
  "&:hover": { color: "var(--ds-ink)", backgroundColor: "var(--ds-surface-raised)" },
};

type AthenaButtonProps = Omit<MuiButtonProps, "variant" | "color"> & {
  variant?: ShadcnVariant;
  color?: MuiButtonProps["color"];
};

export function Button({ variant = "default", color, sx, ...props }: AthenaButtonProps) {
  return (
    <MuiButton
      variant={variantMap[variant] ?? "contained"}
      color={color ?? colorMap[variant] ?? "primary"}
      sx={variant === "ghost" && !color ? [ghostSx, ...(Array.isArray(sx) ? sx : [sx])] : sx}
      {...props}
    />
  );
}

// Navigation styled as the primary button, so a link never wraps a <button>.
export function ButtonLink({ className = "", ...props }: LinkProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
      {...props}
    />
  );
}
