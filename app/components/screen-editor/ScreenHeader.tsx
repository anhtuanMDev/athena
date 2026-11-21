import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";

import { screenName } from "./utils/screen-text";

interface ScreenHeaderProps {
  game: string | undefined;
  title: string | undefined;
  id: string;
  path: string;
  isDirty: boolean;
  isSubmitting: boolean;
  onSave: () => void;
}

/** The screen's name, its file and whether it's saved, and the save button. */
export function ScreenHeader({ game, title, id, path, isDirty, isSubmitting, onSave }: ScreenHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <Link
          to={`/${String(game)}/screens`}
          className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          App screens
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-balance text-ink">Screen: {screenName(title, id)}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="font-mono text-xs">{path}</span>
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            {isDirty ? (
              <>
                <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
                Unsaved changes
              </>
            ) : (
              "Saved"
            )}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-ink-muted lg:inline">
          <kbd className="font-sans">⌘S</kbd> to save
        </span>
        <Button type="button" onClick={onSave} disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save screen"}
        </Button>
      </div>
    </header>
  );
}
