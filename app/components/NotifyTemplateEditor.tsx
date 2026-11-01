import { useId, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/layout-editor/PropControl";
import type { Category, NotifyConfig } from "~/lib/categories";
import { getFile, listDirectory } from "~/lib/github";
import { BODY_LIMIT, TITLE_LIMIT, renderNotification } from "~/lib/notify-template";
import { useData } from "~/lib/use-data";

/**
 * A category's push notification on the Categories page: whether "Notify
 * players" starts ticked, the {field} templates, and a preview rendered by the
 * same code the server sends with, from one of its real records when a game
 * has any.
 */
export function NotifyTemplateEditor({
  row,
  fields,
  sampleGame,
  onChange,
}: {
  row: Category;
  /** The placeholders it may use (notify-template.ts allowedFields). */
  fields: string[];
  /** A game with records in this category, to preview one of them. */
  sampleGame?: string;
  onChange: (notify: NotifyConfig | undefined) => void;
}) {
  const ids = useId();
  const [target, setTarget] = useState<"title" | "body">("title");
  const { notify } = row;
  const { data: sample } = useData(
    async () => {
      if (!sampleGame) return null;
      const names = await listDirectory(sampleGame, row.folder);
      const last = names.at(-1);
      const file = last ? await getFile<Record<string, unknown>>(`data/${sampleGame}/${row.folder}/${last}.json`) : null;
      return file?.content ?? null;
    },
    [sampleGame, row.folder],
    "notify-sample",
  );

  if (!notify) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
        <p>No notification yet: publishing never notifies players.</p>
        <Button type="button" variant="outline" onClick={() => onChange({ enabled: false, title: "", body: "" })}>
          <BellRing aria-hidden="true" className="size-4" /> Add a notification
        </Button>
      </div>
    );
  }

  const set = (change: Partial<NotifyConfig>) => onChange({ ...notify, ...change });
  const record = sample ?? Object.fromEntries(fields.map((f) => [f, `‹${f}›`]));
  const preview = renderNotification(notify, record);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={notify.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-4" />
          &ldquo;Notify players&rdquo; starts ticked when publishing
        </label>
        <label htmlFor={`${ids}-title`} className="block text-sm font-medium text-ink">
          Title
          <input
            id={`${ids}-title`}
            value={notify.title}
            onFocus={() => setTarget("title")}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="{title}"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label htmlFor={`${ids}-body`} className="block text-sm font-medium text-ink">
          Body <span className="font-normal text-ink-muted">(optional)</span>
          <textarea
            id={`${ids}-body`}
            value={notify.body}
            onFocus={() => setTarget("body")}
            onChange={(e) => set({ body: e.target.value })}
            rows={2}
            placeholder="{summary}"
            className={`${inputClass} mt-1`}
          />
        </label>
        <div className="text-sm text-ink-muted">
          <span id={`${ids}-fields`}>Fields of its schemas, added to the {target}:</span>
          <div role="group" aria-labelledby={`${ids}-fields`} className="mt-1 flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => set({ [target]: `${notify[target]}{${f}}` })}
                className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-focus"
              >
                {`{${f}}`}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={() => onChange(undefined)}>
          Remove the notification
        </Button>
      </div>

      <figure className="self-start rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <figcaption className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-muted">
          Preview{sample ? ` · ${String(sample.id ?? "a record")}` : " · placeholder values"}
        </figcaption>
        <p className="font-semibold text-ink break-words">{preview.title || <span className="text-danger">The title comes out empty.</span>}</p>
        {preview.body && <p className="mt-1 text-sm text-ink-muted break-words">{preview.body}</p>}
        <p className="mt-3 text-xs text-ink-muted tabular-nums">
          Title {Array.from(preview.title).length}/{TITLE_LIMIT} · body {Array.from(preview.body).length}/{BODY_LIMIT} characters; longer text is cut with &ldquo;…&rdquo;.
        </p>
      </figure>
    </div>
  );
}
