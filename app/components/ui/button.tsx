import MuiButton from "@mui/material/Button";
import type { ButtonProps as MuiButtonProps } from "@mui/material/Button";

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
};

type AthenaButtonProps = Omit<MuiButtonProps, "variant" | "color"> & {
  variant?: ShadcnVariant;
  color?: MuiButtonProps["color"];
};

export function Button({ variant = "default", color, ...props }: AthenaButtonProps) {
  return (
    <MuiButton
      variant={variantMap[variant] ?? "contained"}
      color={color ?? colorMap[variant] ?? "primary"}
      {...props}
    />
  );
}
