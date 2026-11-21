import type { PropIds } from "../types";

interface PropFooterProps {
  ids: PropIds;
  help: string;
  error?: string;
}

/** The help under a prop's input, and its error. */
export function PropFooter({ ids, help, error }: PropFooterProps) {
  return (
    <>
      <p id={ids.help} className="mt-1 text-xs text-ink-muted">
        {help}
      </p>
      {error && (
        <p id={ids.error} className="mt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </>
  );
}
