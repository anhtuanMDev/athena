interface MissingValueProps {
  path: string;
}

/** A bound value the data doesn't have: its path, in a dashed box. */
export function MissingValue({ path }: MissingValueProps) {
  return (
    <span className="inline-flex max-w-full items-center rounded border border-dashed border-border-strong px-1.5 font-mono text-[0.75rem] font-normal text-ink-muted">
      <span className="truncate">{path}</span>
    </span>
  );
}
