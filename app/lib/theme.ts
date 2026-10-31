import { createTheme } from "@mui/material/styles";
import type { PaletteOptions } from "@mui/material/styles";

// Colors are the DESIGN.md tokens declared as --ds-* variables in app/app.css.
// Those variables already switch with the system color scheme, so both MUI
// schemes point at the same values; nativeColor lets MUI derive hover and
// alpha shades from CSS variables, and contrast text is set explicitly.
const palette: PaletteOptions = {
  primary: {
    main: "var(--ds-primary)",
    dark: "var(--ds-primary-deep)",
    contrastText: "var(--ds-on-primary)",
  },
  error: { main: "var(--ds-danger)", contrastText: "#fff" },
  info: { main: "var(--ds-info)", contrastText: "#fff" },
  success: { main: "var(--ds-success)", contrastText: "#fff" },
  warning: { main: "var(--ds-warning)", contrastText: "var(--ds-on-primary)" },
  background: {
    default: "var(--ds-page)",
    paper: "var(--ds-surface)",
  },
  text: {
    primary: "var(--ds-ink)",
    secondary: "var(--ds-ink-muted)",
  },
  divider: "var(--ds-border)",
};

const transition = ["background-color", "border-color", "color", "box-shadow"]
  .map((property) => `${property} 150ms cubic-bezier(0.4, 0, 0.2, 1)`)
  .join(", ");

const focusRing = {
  outline: "2px solid var(--ds-focus)",
  outlineOffset: 2,
};

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media", nativeColor: true },
  colorSchemes: {
    light: { palette },
    dark: { palette },
  },
  typography: {
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.025em" },
    h2: { fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: "none" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          padding: "8px 16px",
          transition,
          "&.Mui-focusVisible": focusRing,
          variants: [
            {
              props: { variant: "contained", color: "primary" },
              style: {
                boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                "&:hover": { backgroundColor: "var(--ds-primary-deep)" },
              },
            },
          ],
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { "&.Mui-focusVisible": focusRing },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--ds-surface)",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--ds-border-strong)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "var(--ds-focus)" },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: "1px solid var(--ds-border)",
          backgroundColor: "var(--ds-surface)",
          boxShadow: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});
