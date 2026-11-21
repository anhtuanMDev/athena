import { GENERIC_PROPS } from "../utils/preview-data";
import { makeReader } from "../utils/preview-reader";

import type { PreviewProps } from "../types";

/** A block without a preview of its own (or unknown to the manifest): its name and its first props. */
export function GenericPreview(props: PreviewProps) {
  const { show } = makeReader(props);
  const { block, spec } = props;
  const names = Object.keys(block.props);
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="font-mono text-xs font-medium">{spec?.name ?? block.type}</p>
      {names.length > 0 && (
        <dl className="mt-2 space-y-1 text-xs">
          {names.slice(0, GENERIC_PROPS).map((name) => (
            <div key={name} className="flex gap-2">
              <dt className="shrink-0 font-mono text-ink-muted">{name}</dt>
              <dd className="min-w-0 truncate">{show(name)}</dd>
            </div>
          ))}
        </dl>
      )}
      {names.length === 0 && <p className="mt-1 text-xs text-ink-muted">No props set</p>}
    </div>
  );
}
