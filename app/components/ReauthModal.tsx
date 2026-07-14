import { useState, useEffect, useRef } from "react";
import { login as authLogin } from "~/lib/auth";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Typography from "@mui/material/Typography";
import { Eye, EyeOff, LoaderCircle, AlertCircle } from "lucide-react";

export function ReauthModal() {
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleAuthExpired = () => {
      setOpen(true);
      // Slight delay to allow the modal to render before focusing
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    };
    window.addEventListener("AUTH_EXPIRED", handleAuthExpired);
    return () => window.removeEventListener("AUTH_EXPIRED", handleAuthExpired);
  }, []);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    try {
      await authLogin(password);
      setOpen(false);
      
      // Dispatch an event so that useData hooks can retry their requests
      import("~/lib/use-data").then((m) => m.clearDataCache());
    } catch (err: unknown) {
      const message = (err as Error).message || "Invalid password";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Card
        sx={{
          width: "100%",
          maxWidth: 400,
          bgcolor: "rgba(18,18,30,0.95)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 3,
          boxShadow: "0 0 60px rgba(99, 102, 241, 0.08), 0 0 120px rgba(99, 102, 241, 0.04)",
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ color: "white", mb: 1, fontWeight: 600 }}>
            Session Expired
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", mb: 3 }}>
            Please enter your password to continue working without losing your changes.
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              inputRef={inputRef}
              name="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              disabled={isSubmitting}
              fullWidth
              size="small"
              sx={{ mb: 3 }}
              slotProps={{
                input: {
                  sx: {
                    borderRadius: 2,
                    bgcolor: "rgba(255,255,255,0.04)",
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.15)" },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(99,102,241,0.5)" },
                  },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        size="small"
                        sx={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
                inputLabel: {
                  sx: { color: "rgba(255,255,255,0.35)", "&.Mui-focused": { color: "rgba(99,102,241,0.7)" } },
                },
              }}
            />
            {error && (
              <Alert
                severity="error"
                icon={<AlertCircle className="size-4" />}
                sx={{
                  mb: 3,
                  borderRadius: 2,
                  bgcolor: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  "& .MuiAlert-message": { color: "rgba(252,165,165,0.9)" },
                }}
              >
                <AlertTitle sx={{ mb: 0, fontWeight: 400 }}>{error}</AlertTitle>
              </Alert>
            )}
            <Button
              type="submit"
              fullWidth
              disabled={isSubmitting}
              variant="contained"
              sx={{
                py: 1.4,
                borderRadius: 2,
                fontWeight: 500,
                textTransform: "none",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                "&:hover": { background: "linear-gradient(135deg, #5558e6, #7c4fe6)" },
              }}
            >
              {isSubmitting ? (
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  <LoaderCircle className="size-4" style={{ animation: "spin 0.8s linear infinite" }} />
                  Authenticating...
                </Box>
              ) : (
                "Sign in & Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
