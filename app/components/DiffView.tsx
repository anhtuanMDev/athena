import type { DiffEntry } from "~/lib/diff";

interface DiffViewProps {
  diffs: DiffEntry[];
  /** Pictures the save uploads (public/assets paths): a save may change pictures alone. */
  uploads?: string[];
}

export function DiffView({ diffs, uploads = [] }: DiffViewProps) {
  const pictures = uploads.length > 0 && (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-ink">Pictures to upload ({uploads.length})</h3>
      <ul className="space-y-0.5 text-xs text-ink-muted">
        {uploads.map((path) => (
          <li key={path}>
            <code>{path.replace(/^public\//, "")}</code>
          </li>
        ))}
      </ul>
    </div>
  );
  if (diffs.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{uploads.length > 0 ? "The record itself is unchanged." : "No changes detected."}</p>
        {pictures}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">Changes ({diffs.length})</h3>
      <div className="rounded-md border border-border divide-y divide-gray-200 dark:divide-gray-700">
        {diffs.map((diff, i) => (
          <div key={i} className="px-4 py-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                diff.type === "added" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                diff.type === "removed" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" :
                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
              }`}>
                {diff.type}
              </span>
              <code className="text-ink-muted">{diff.path}</code>
            </div>
            {diff.type === "changed" && (
              <div className="ml-2 space-y-1">
                <div className="text-red-600 dark:text-red-400">
                  <span className="text-xs text-ink-muted">from:</span>{" "}
                  <code className="text-xs">{JSON.stringify(diff.from)}</code>
                </div>
                <div className="text-green-600 dark:text-green-400">
                  <span className="text-xs text-ink-muted">to:</span>{" "}
                  <code className="text-xs">{JSON.stringify(diff.to)}</code>
                </div>
              </div>
            )}
            {diff.type === "added" && (
              <div className="ml-2 text-green-600 dark:text-green-400">
                <code className="text-xs">{JSON.stringify(diff.to)}</code>
              </div>
            )}
            {diff.type === "removed" && (
              <div className="ml-2 text-red-600 dark:text-red-400">
                <code className="text-xs">{JSON.stringify(diff.from)}</code>
              </div>
            )}
          </div>
        ))}
      </div>
      {pictures}
    </div>
  );
}
