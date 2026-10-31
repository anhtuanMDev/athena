import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { useNavigate } from "react-router";
import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { checkSession, login as authLogin } from "~/lib/auth";

function Countdown({
  seconds,
  onDone,
}: {
  seconds: number;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          doneRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  return <span className="tabular-nums">{remaining}s</span>;
}

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{
    message: string;
    retryAfter?: number;
  } | null>(null);
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    checkSession().then((authenticated) => {
      if (authenticated) navigate("/dashboard");
    });
  }, [navigate]);

  const handleRetryDone = useCallback(() => {
    setRetrySeconds(null);
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;

    try {
      await authLogin(password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const retryAfter = (err as Record<string, unknown>).retryAfter as
        number | undefined;
      if (retryAfter != null) {
        setError({ message: "Too many attempts", retryAfter });
        setRetrySeconds(retryAfter);
      } else {
        setError({ message: (err as Error).message || "Invalid password" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-surface border border-border rounded-xl px-6 py-8 sm:px-8 sm:py-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center">
              <img src="/favicon.svg" alt="" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink text-balance">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Enter your credentials to access the panel
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <TextField
                inputRef={inputRef}
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                label="Password"
                autoFocus
                disabled={isSubmitting}
                autoComplete="current-password"
                fullWidth
                size="small"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword((v) => !v)}
                          edge="end"
                          size="small"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <EyeOff aria-hidden="true" className="size-4" />
                          ) : (
                            <Eye aria-hidden="true" className="size-4" />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </div>

            {error && (
              <div className="mb-6">
                <Alert
                  severity="error"
                  icon={<AlertCircle aria-hidden="true" className="size-4" />}
                >
                  {retrySeconds !== null ? (
                    <>
                      Too many attempts. Try again in{" "}
                      <Countdown
                        seconds={retrySeconds}
                        onDone={handleRetryDone}
                      />
                    </>
                  ) : (
                    error.message
                  )}
                </Alert>
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              disabled={isSubmitting || retrySeconds !== null}
              variant="contained"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  Authenticating…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">Admin Panel</p>
      </div>
    </main>
  );
}
