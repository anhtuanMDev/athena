import { useState, useEffect, useRef } from "react";
import { login as authLogin } from "~/lib/auth";
import Dialog from "@mui/material/Dialog";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
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
    <Dialog
      open
      aria-labelledby="reauth-title"
      aria-describedby="reauth-description"
      slotProps={{
        paper: {
          sx: { width: "100%", maxWidth: 400, m: 2, borderRadius: "16px", border: "1px solid var(--ds-border)" },
        },
      }}
    >
      <div className="p-8">
        <h2 id="reauth-title" className="text-lg font-semibold text-ink mb-1">
          Session Expired
        </h2>
        <p id="reauth-description" className="text-sm text-ink-muted mb-6">
          Please enter your password to continue working without losing your changes.
        </p>
        <form onSubmit={handleSubmit}>
          <TextField
            inputRef={inputRef}
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            autoComplete="current-password"
            disabled={isSubmitting}
            fullWidth
            size="small"
            sx={{ mb: 3 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {error && (
            <Alert severity="error" icon={<AlertCircle aria-hidden="true" className="size-4" />} sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          <Button type="submit" fullWidth disabled={isSubmitting} variant="contained">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                Authenticating…
              </span>
            ) : (
              "Sign in & Continue"
            )}
          </Button>
        </form>
      </div>
    </Dialog>
  );
}
