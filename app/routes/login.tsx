import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { useNavigate } from "react-router";
import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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

  const cardRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    checkSession().then((authenticated) => {
      if (authenticated) navigate("/dashboard");
    });
  }, [navigate]);

  useEffect(() => {
    const bgEl = document.getElementById("login-bg-glow");
    const gridEl = document.getElementById("login-bg-grid");
    const scanEl = document.getElementById("login-bg-scan");

    const anims: JSAnimation[] = [];

    if (bgEl) {
      anims.push(
        animate(bgEl, {
          keyframes: [
            { opacity: 0.5, scale: 1.08 },
            { opacity: 0.8, scale: 0.95 },
            { opacity: 0.5, scale: 1.08 },
          ],
          duration: 7000,
          loop: true,
          easing: "easeInOutSine",
        }),
      );
    }

    if (gridEl) {
      anims.push(
        animate(gridEl, {
          backgroundPosition: ["0 0", "32px 32px"],
          duration: 10000,
          loop: true,
          easing: "linear",
        }),
      );
    }

    if (scanEl) {
      anims.push(
        animate(scanEl, {
          translateY: ["-100vh", "100vh"],
          duration: 8000,
          loop: true,
          easing: "linear",
        }),
      );
    }

    return () => anims.forEach((a) => a.pause());
  }, []);

  const runEntrance = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    const els = [logoRef, titleRef, subtitleRef, fieldRef, btnRef]
      .map((r) => r.current)
      .filter(Boolean);
    const tl = createTimeline({ playbackEase: "easeOutExpo" });

    tl.add(card, { opacity: [0, 1], translateY: [24, 0], duration: 700 }).add(
      els,
      {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 400,
        delay: stagger(60),
      },
      "-=300",
    );
  }, []);

  useEffect(() => {
    runEntrance();
  }, [runEntrance]);

  const handleShake = useCallback(() => {
    if (!cardRef.current) return;
    animate(cardRef.current, {
      translateX: [0, -5, 5, -4, 4, -2, 2, 0],
      duration: 450,
      easing: "easeInOutSine",
    });
  }, []);

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
      handleShake();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <Box
        id="login-bg-glow"
        className="absolute inset-0 pointer-events-none"
        sx={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 20%, oklch(0.45 0.15 270) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 80% 80%, oklch(0.4 0.12 290) 0%, transparent 50%)",
        }}
      />
      <Box
        id="login-bg-grid"
        className="absolute inset-0 pointer-events-none"
        sx={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.03) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <Box
        id="login-bg-scan"
        className="absolute inset-0 pointer-events-none"
        sx={{
          opacity: 0.02,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(1 0 0) 2px, oklch(1 0 0) 3px)",
        }}
      />

      <Box sx={{ position: "relative", width: "100%", maxWidth: 448, px: 3 }}>
        <Card
          ref={cardRef}
          sx={{
            opacity: 0,
            backdropFilter: "blur(24px)",
            bgcolor: "rgba(18, 18, 30, 0.85)",
            border: "1px solid",
            borderColor: "rgba(99, 102, 241, 0.15)",
            boxShadow:
              "0 0 60px rgba(99, 102, 241, 0.08), 0 0 120px rgba(99, 102, 241, 0.04)",
            borderRadius: 3,
          }}
        >
          <CardContent sx={{ px: 4, py: 5 }}>
            <Box sx={{ textAlign: "center", mb: 4 }}>
              <Box
                ref={logoRef}
                sx={{
                  mx: "auto",
                  mb: 2,
                  width: 48,
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 2,
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))",
                  border: "1px solid rgba(99,102,241,0.15)",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: 20,
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #a5b4fc, #c4b5fd)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Z
                </Box>
              </Box>
              <Typography
                ref={titleRef}
                variant="h5"
                sx={{
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "grey.100",
                }}
              >
                Welcome back
              </Typography>
              <Typography
                ref={subtitleRef}
                variant="body2"
                sx={{ color: "rgba(255,255,255,0.45)", mt: 0.5 }}
              >
                Enter your credentials to access the panel
              </Typography>
            </Box>

            <form onSubmit={handleSubmit}>
              <Box ref={fieldRef} sx={{ mb: 3 }}>
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
                      sx: {
                        borderRadius: 2,
                        bgcolor: "rgba(255,255,255,0.04)",
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(255,255,255,0.08)",
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(255,255,255,0.15)",
                        },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(99,102,241,0.5)",
                        },
                        "&.Mui-focused": { bgcolor: "rgba(99,102,241,0.06)" },
                      },
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword((v) => !v)}
                            edge="end"
                            size="small"
                            sx={{ color: "rgba(255,255,255,0.25)" }}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                    inputLabel: {
                      sx: {
                        color: "rgba(255,255,255,0.35)",
                        "&.Mui-focused": { color: "rgba(99,102,241,0.7)" },
                      },
                    },
                  }}
                />
              </Box>

              {error && (
                <Box ref={alertRef} sx={{ mb: 3 }}>
                  <Alert
                    severity="error"
                    icon={<AlertCircle className="size-4" />}
                    sx={{
                      borderRadius: 2,
                      bgcolor: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      "& .MuiAlert-message": { color: "rgba(252,165,165,0.9)" },
                    }}
                  >
                    <AlertTitle sx={{ mb: 0, fontWeight: 400 }}>
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
                    </AlertTitle>
                  </Alert>
                </Box>
              )}

              <Box ref={btnRef}>
                <Button
                  type="submit"
                  fullWidth
                  disabled={isSubmitting || retrySeconds !== null}
                  variant="contained"
                  sx={{
                    py: 1.4,
                    borderRadius: 2,
                    fontWeight: 500,
                    textTransform: "none",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #5558e6, #7c4fe6)",
                    },
                    "&.Mui-disabled": { opacity: 0.4 },
                  }}
                >
                  {isSubmitting ? (
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <LoaderCircle
                        className="size-4"
                        style={{ animation: "spin 0.8s linear infinite" }}
                      />
                      Authenticating...
                    </Box>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>

        <Typography
          variant="caption"
          sx={{
            textAlign: "center",
            display: "block",
            mt: 3,
            color: "rgba(255,255,255,0.2)",
          }}
        >
          Admin Panel
        </Typography>
      </Box>
    </Box>
  );
}
