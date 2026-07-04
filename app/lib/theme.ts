import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  colorSchemes: {
    dark: true,
  },
  typography: {
    fontFamily: '"Inter Variable", sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontWeight: 700, letterSpacing: "-0.01em" },
    h3: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: "none" },
  },
  shape: { borderRadius: 12 },
  palette: {
    mode: 'dark',
    primary: {
      main: "#f97316", // Orange 500
      light: "#fb923c",
      dark: "#ea580c",
    },
    secondary: {
      main: "#3b82f6", // Blue 500
      light: "#60a5fa",
      dark: "#2563eb",
    },
    background: {
      default: "#09090b", // zinc-950
      paper: "#18181b", // zinc-900
    },
    divider: "rgba(255, 255, 255, 0.08)",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { 
          borderRadius: 8,
          padding: "8px 16px",
          transition: "all 0.2s ease-in-out",
        },
        // @ts-expect-error type mismatch
        containedPrimary: {
          backgroundImage: "linear-gradient(to right, #ea580c, #f97316)",
          boxShadow: "0 4px 14px 0 rgba(249, 115, 22, 0.39)",
          "&:hover": {
            backgroundImage: "linear-gradient(to right, #c2410c, #ea580c)",
            boxShadow: "0 6px 20px rgba(249, 115, 22, 0.23)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { 
          border: "1px solid rgba(255, 255, 255, 0.08)", 
          background: "rgba(17, 24, 39, 0.7)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        }
      }
    }
  },
});
