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
      main: "#8b5cf6", // Vibrant Purple
      light: "#a78bfa",
      dark: "#6d28d9",
    },
    secondary: {
      main: "#06b6d4", // Cyan
      light: "#22d3ee",
      dark: "#0891b2",
    },
    background: {
      default: "#030712", // gray-950
      paper: "#111827", // gray-900
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
        containedPrimary: {
          backgroundImage: "linear-gradient(to right, #6d28d9, #8b5cf6)",
          boxShadow: "0 4px 14px 0 rgba(139, 92, 246, 0.39)",
          "&:hover": {
            backgroundImage: "linear-gradient(to right, #5b21b6, #7c3aed)",
            boxShadow: "0 6px 20px rgba(139, 92, 246, 0.23)",
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
