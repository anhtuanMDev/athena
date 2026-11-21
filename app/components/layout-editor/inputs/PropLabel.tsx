interface PropLabelProps {
  inputId: string;
  name: string;
  required?: boolean;
}

/** A prop's name over its input, and whether the app needs it. */
export function PropLabel({ inputId, name, required }: PropLabelProps) {
  return (
    <label htmlFor={inputId} className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-mono text-xs font-medium text-ink">{name}</span>
      {required && <span className="text-xs text-ink-muted">required</span>}
    </label>
  );
}
