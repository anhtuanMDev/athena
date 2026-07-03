import { useCallback, useEffect, useRef, useState } from "react";
import { data, Form, redirect, useActionData, useNavigation } from "react-router";
import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { Route } from "./+types/login";
import { login, createAdminSession, getAdminSession, SESSION_KEY } from "~/lib/session.server";
import { checkRateLimit, getClientIp, recordAttempt } from "~/lib/rate-limit.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getAdminSession(request);
  if (session.get(SESSION_KEY)) {
    throw redirect("/dashboard");
  }
  return null;
}

type ActionData = { error: string; retryAfter?: number } | Record<string, never>;

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  const ip = getClientIp(request);
  const { allowed, retryAfter } = checkRateLimit(ip);
  if (!allowed) {
    return data({ error: "Too many attempts", retryAfter } satisfies ActionData, { status: 429 });
  }

  if (!password || !(await login(password))) {
    recordAttempt(ip, false);
    return data({ error: "Invalid password" } satisfies ActionData, { status: 401 });
  }

  recordAttempt(ip, true);
  const cookie = await createAdminSession(request);
  return redirect("/dashboard", { headers: { "Set-Cookie": cookie } });
}

function Countdown({ seconds, onDone }: { seconds: number; onDone: () => void }) {
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

export default function Login({ actionData }: Route.ComponentProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const inputRef = useRef<HTMLInputElement>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const staggerRef = useRef<(HTMLDivElement | null)[]>([]);

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

  useEffect(() => {
    const err = actionData as ActionData | undefined;
    if (err?.retryAfter != null) {
      setRetrySeconds(err.retryAfter);
    }
  }, [actionData]);

  const runEntrance = useCallback(() => {
    const card = cardRef.current;
    const glow = glowRef.current;
    if (!card || !glow) return;

    const tl = createTimeline({ playbackEase: "easeOutExpo" });

    tl.add(glow, { opacity: [0, 1], duration: 600 })
      .add(
        card,
        { opacity: [0, 1], translateY: [24, 0], duration: 700 },
        "-=400",
      )
      .add(
        staggerRef.current.filter(Boolean),
        { opacity: [0, 1], translateY: [10, 0], duration: 400, delay: stagger(60) },
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

  const handleError = useCallback(() => {
    handleShake();
  }, [handleShake]);

  const handleRetryDone = useCallback(() => {
    setRetrySeconds(null);
    inputRef.current?.focus();
  }, []);

  const err = actionData as ActionData | undefined;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      <div
        id="login-bg-glow"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 20%, oklch(0.45 0.15 270) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 80% 80%, oklch(0.4 0.12 290) 0%, transparent 50%)",
        }}
      />

      <div
        id="login-bg-grid"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.03) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div
        id="login-bg-scan"
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(1 0 0) 2px, oklch(1 0 0) 3px)",
        }}
      />

      <div className="relative w-full max-w-md px-6">
        <div ref={glowRef} className="rounded-2xl" style={{ opacity: 0 }}>
          <Card
            ref={cardRef}
            className="border-none shadow-2xl"
            style={{
              opacity: 0,
              background:
                "linear-gradient(135deg, oklch(0.2 0.02 270 / 0.9), oklch(0.15 0.02 280 / 0.95))",
              boxShadow:
                "0 0 40px oklch(0.45 0.15 270 / 0.08), 0 0 80px oklch(0.45 0.15 270 / 0.04)",
            }}
          >
            <CardHeader className="text-center border-none pb-2">
              <div
                ref={(el) => {
                  staggerRef.current[0] = el;
                }}
                className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.6 0.2 270 / 0.2), oklch(0.5 0.15 290 / 0.1))",
                  border: "1px solid oklch(0.6 0.2 270 / 0.15)",
                }}
              >
                <span
                  className="text-xl font-bold"
                  style={{
                    background: "linear-gradient(135deg, #a5b4fc, #c4b5fd)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Z
                </span>
              </div>
              <CardTitle
                ref={(el) => {
                  staggerRef.current[1] = el;
                }}
                className="text-2xl font-semibold tracking-tight text-white"
              >
                Welcome back
              </CardTitle>
              <CardDescription
                ref={(el) => {
                  staggerRef.current[2] = el;
                }}
                className="text-sm"
                style={{ color: "oklch(1 0 0 / 0.45)" }}
              >
                Enter your credentials to access the panel
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Form method="post" className="space-y-6">
                <div
                  ref={(el) => {
                    staggerRef.current[3] = el;
                  }}
                  className="relative"
                >
                  <Input
                    ref={inputRef}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder=" "
                    autoFocus
                    disabled={isSubmitting}
                    autoComplete="current-password"
                    className="peer h-12 rounded-xl border px-4 pt-5 pb-1 text-sm text-white shadow-none transition-all duration-200 placeholder:text-transparent focus-visible:ring-2 focus-visible:ring-offset-0 disabled:opacity-40"
                    style={{
                      backgroundColor: "oklch(1 0 0 / 0.04)",
                      borderColor: "oklch(1 0 0 / 0.08)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "oklch(0.6 0.2 270 / 0.5)";
                      e.currentTarget.style.backgroundColor = "oklch(0.6 0.2 270 / 0.06)";
                      animate(e.currentTarget, {
                        boxShadow: [
                          "0 0 0 0 oklch(0.6 0.2 270 / 0)",
                          "0 0 0 4px oklch(0.6 0.2 270 / 0.1)",
                        ],
                        duration: 300,
                        easing: "easeOutQuad",
                      });
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "oklch(1 0 0 / 0.08)";
                      e.currentTarget.style.backgroundColor = "oklch(1 0 0 / 0.04)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <Label
                    htmlFor="password"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-sm transition-all duration-200 pointer-events-none peer-focus:-translate-y-5 peer-focus:text-xs peer-focus:top-3 peer-[:not(:placeholder-shown)]:-translate-y-5 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:top-3"
                    style={{ color: "oklch(1 0 0 / 0.35)" }}
                  >
                    Password
                  </Label>

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                {err?.error && (
                  <div
                    ref={(el) => {
                      staggerRef.current[4] = el;
                    }}
                    className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm"
                    style={{
                      backgroundColor: "oklch(0.6 0.2 25 / 0.1)",
                      border: "1px solid oklch(0.6 0.2 25 / 0.2)",
                      color: "oklch(0.75 0.15 25 / 0.9)",
                    }}
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {retrySeconds !== null ? (
                        <>
                          Too many attempts. Try again in{" "}
                          <Countdown seconds={retrySeconds} onDone={handleRetryDone} />
                        </>
                      ) : (
                        err.error
                      )}
                    </span>
                  </div>
                )}

                <div
                  ref={(el) => {
                    staggerRef.current[5] = el;
                  }}
                >
                  <Button
                    type="submit"
                    disabled={isSubmitting || retrySeconds !== null}
                    className="relative w-full h-11 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.55 0.2 270), oklch(0.5 0.18 290))",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubmitting && retrySeconds === null) {
                        animate(e.currentTarget, {
                          boxShadow: [
                            "0 0 0 0 oklch(0.55 0.2 270 / 0)",
                            "0 4px 20px oklch(0.55 0.2 270 / 0.3)",
                          ],
                          duration: 200,
                          easing: "easeOutQuad",
                        });
                      }
                    }}
                    onMouseLeave={(e) => {
                      animate(e.currentTarget, {
                        boxShadow: [
                          "0 4px 20px oklch(0.55 0.2 270 / 0.3)",
                          "0 0 0 0 oklch(0.55 0.2 270 / 0)",
                        ],
                        duration: 200,
                        easing: "easeOutQuad",
                      });
                    }}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        Authenticating...
                      </span>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </div>
              </Form>
            </CardContent>
          </Card>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "oklch(1 0 0 / 0.2)" }}
        >
          Athena Admin Panel
        </p>
      </div>
    </div>
  );
}
