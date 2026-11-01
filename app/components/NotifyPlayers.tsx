import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useCategories } from "~/lib/categories-context";
import { getPushStatus } from "~/lib/github";
import { PUSHES_PER_GAME_PER_HOUR, type PushResult } from "~/lib/push";

let pushStatus: Promise<boolean | undefined> | undefined;

/** Whether the server can send pushes, asked once per page load; undefined until known or when it can't be asked. */
export function usePushConfigured(): boolean | undefined {
  const [configured, setConfigured] = useState<boolean>();
  useEffect(() => {
    let live = true;
    pushStatus ??= getPushStatus().then(
      (status) => status.configured,
      () => {
        pushStatus = undefined;
        return undefined;
      },
    );
    pushStatus.then((value) => live && setConfigured(value));
    return () => {
      live = false;
    };
  }, []);
  return configured;
}

/** The warning shown wherever pushes are set up or sent while the server has no credentials. */
export function PushNotConfigured({ className = "" }: { className?: string }) {
  return (
    <p role="status" className={`rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 ${className}`}>
      Push notifications aren&apos;t set up on the server yet (the FCM_SERVICE_ACCOUNT secret), so nothing is sent to players.
    </p>
  );
}

/**
 * The "Notify players" choice for publishing a new record of `category`,
 * shared by every view that publishes one. It starts as the category's
 * default and is unavailable when the category has no notification. Only the
 * choice reaches the server, which writes the push from the category's
 * templates and the saved record.
 */
export function useNotifyPlayers(category: string): { notify: boolean; field: ReactNode } {
  const config = useCategories().find((c) => c.category === category);
  const [choice, setChoice] = useState<boolean>();
  // The categories load after the page opens: follow their default until the admin picks.
  const notify = !!config?.notify && (choice ?? config.notify.enabled);
  return {
    notify,
    field: <NotifyPlayersField label={config?.label ?? category} template={config?.notify?.title} checked={notify} onChange={setChoice} />,
  };
}

function NotifyPlayersField({
  label,
  template,
  checked,
  onChange,
}: {
  label: string;
  template?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const configured = usePushConfigured();
  const hint = useId();
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
      <label className="flex items-center gap-2 font-medium text-ink">
        <input
          type="checkbox"
          checked={checked}
          disabled={!template}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint}
          className="size-4 disabled:opacity-50"
        />
        Notify players
      </label>
      <p id={hint} className="mt-1 text-ink-muted">
        {template ? (
          <>
            Sends &ldquo;{template}&rdquo;, filled in from this record, to every player with notifications on. At most {PUSHES_PER_GAME_PER_HOUR} an hour per game.
          </>
        ) : (
          <>
            {label} has no notification yet.{" "}
            <Link to="/categories" className="underline hover:text-ink">
              Set one up on the Categories page
            </Link>
            .
          </>
        )}
      </p>
      {template && configured === false && <PushNotConfigured className="mt-2" />}
    </div>
  );
}

/** One toast for a publish and what happened to its push. */
export function publishedToast(toast: { success: (message: string) => void; warning: (message: string) => void }, published: string, push?: PushResult) {
  if (!push) return toast.success(published);
  if (push.status === "sent") return toast.success(`${published} Players were notified.`);
  const why = push.status === "not_configured" ? "Push notifications aren't set up on the server." : push.warning ?? "";
  toast.warning(`${published} Players weren't notified. ${why}`.trim());
}
