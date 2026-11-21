interface NodePropProps {
  name: string;
}

/** A prop the app fills with its own content, which a screen can't set. */
export function NodeProp({ name }: NodePropProps) {
  return (
    <div>
      <p className="font-mono text-xs font-medium text-ink">{name}</p>
      <p className="mt-1 text-xs text-ink-muted">React content the app supplies itself; a screen can't set it.</p>
    </div>
  );
}
