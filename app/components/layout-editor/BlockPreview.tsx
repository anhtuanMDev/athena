import type { ReactNode } from "react";
import { ChevronRight, ImageOff } from "lucide-react";
import {
  bindingPath,
  bindingScope,
  isBinding,
  normalizeSource,
  type FieldOption,
  type PrimitiveSpec,
  type RecordSource,
  type ScreenBlock,
} from "~/lib/screen-model";

// A sketch of what each app block receives, not the app's own styling.

type Record_ = Record<string, unknown>;

export interface PreviewContext {
  /** What "data.<path>" reads. */
  data: unknown;
  /** Records a source lists (the app applies the same sort and limit). */
  recordsFor: (source: RecordSource | undefined) => Record_[];
  /** Enum option names for chips and enum-bound values. */
  enumOptions: (field: FieldOption | undefined) => { id: string; name: string }[];
  dataFields: FieldOption[];
  screenSource?: RecordSource;
}

function resolvePath(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record_)[key] : undefined),
    data,
  );
}

function MissingValue({ path }: { path: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded border border-dashed border-border-strong px-1.5 font-mono text-[0.75rem] font-normal text-ink-muted">
      <span className="truncate">{path}</span>
    </span>
  );
}

export function assetUrl(value: unknown): string | null {
  if (value && typeof value === "object") {
    const first = Object.values(value as Record_).find((v) => typeof v === "string");
    return assetUrl(first);
  }
  if (typeof value !== "string" || !value) return null;
  if (/^https?:\/\//.test(value) || value.startsWith("/")) return value;
  if (value.startsWith("assets/")) return `/api/${value}`;
  return null;
}

function makeReader(block: ScreenBlock, spec: PrimitiveSpec | undefined, ctx: PreviewContext, item?: unknown) {
  const raw = (name: string): unknown => {
    const prop = block.props[name];
    let value: unknown = prop;
    if (isBinding(prop)) {
      value = resolvePath(bindingScope(prop) === "item" ? item : ctx.data, bindingPath(prop));
      if (typeof value === "string") {
        const field = ctx.dataFields.find((f) => f.key === bindingPath(prop));
        const option = ctx.enumOptions(field).find((o) => o.id === value);
        if (option) value = option.name;
      }
    }
    if (value !== undefined && value !== null && value !== "") return value;
    if (isBinding(prop)) return undefined;
    return spec?.props[name]?.default;
  };
  const show = (name: string): ReactNode => {
    const value = raw(name);
    if (value !== undefined && value !== null && value !== "") {
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    const prop = block.props[name];
    return isBinding(prop) ? <MissingValue path={prop} /> : null;
  };
  return { raw, show };
}

function PreviewImage({ src, className }: { src: string | null; className: string }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface-raised text-ink-muted ${className}`}>
        <ImageOff aria-hidden="true" className="size-5" />
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />;
}

function SectionTitle({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="mb-2 text-sm font-bold uppercase tracking-wide">{children}</p>;
}

function Button({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold uppercase italic ${
        dark ? "bg-ink text-page" : "border border-border-strong"
      }`}
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </span>
  );
}

/** Favorites differ per player, so a favorites list previews sample records. */
function FavoritesNote({ source }: { source: RecordSource | undefined }) {
  if (!source?.favorites) return null;
  return <p className="mb-2 text-xs text-ink-muted">Each signed-in player sees their own favorites (hidden when signed out). Sample:</p>;
}

function stats(block: ScreenBlock, show: (name: string) => ReactNode) {
  return [1, 2, 3, 4].flatMap((n) =>
    block.props[`stat${n}Value`] !== undefined ? [{ label: block.props[`stat${n}Label`], value: show(`stat${n}Value`) }] : [],
  );
}

function BlockBody({ block, spec, ctx }: { block: ScreenBlock; spec: PrimitiveSpec | undefined; ctx: PreviewContext }) {
  const { raw, show } = makeReader(block, spec, ctx);
  const listSource = normalizeSource(block.props.source) ?? ctx.screenSource;

  switch (block.type) {
    case "screen_header":
      return (
        <div className="space-y-1">
          {raw("showLogo") !== false && (
            <p className="flex items-center gap-2 text-xs font-bold uppercase">
              <span className="size-5 rounded-full bg-surface-raised" /> Game logo
            </p>
          )}
          {show("title") && <p className="text-3xl font-black uppercase italic leading-none">{show("title")}</p>}
          {show("subtitle") && <p className="text-xs uppercase tracking-widest text-ink-muted">{show("subtitle")}</p>}
        </div>
      );
    case "featured_carousel": {
      const records = ctx.recordsFor(listSource);
      if (records.length === 0) return <p className="text-xs text-ink-muted">Carousel: no records to show yet</p>;
      const item = makeReader(block, spec, ctx, records[0]);
      if (raw("variant") === "cards") {
        return (
          <div>
            <FavoritesNote source={listSource} />
            <div className="flex items-center gap-2 overflow-hidden">
              {records.slice(0, 3).map((record, i) => {
                const r = makeReader(block, spec, ctx, record);
                return (
                  <div key={i} className={`relative shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-surface ${i === 1 || records.length === 1 ? "h-48 w-36" : "h-40 w-28 opacity-60"}`}>
                    <PreviewImage src={assetUrl(r.raw("itemImage"))} className="absolute inset-0 h-full w-full opacity-70" />
                    <div className="relative space-y-0.5 p-2">
                      <p className="text-[0.75rem] font-semibold uppercase">{r.show("itemSubtitle")}</p>
                      <p className="text-base font-black uppercase italic leading-none">{r.show("itemTitle")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <div>
          <FavoritesNote source={listSource} />
          <div className="space-y-2 rounded-2xl bg-ink p-4 text-page">
            {show("eyebrow") && <p className="text-[0.75rem] font-semibold uppercase italic opacity-80">{show("eyebrow")}</p>}
            <p className="text-2xl font-black uppercase italic leading-none">{item.show("itemTitle")}</p>
            {item.show("itemSubtitle") && <p className="text-xs font-semibold uppercase">{item.show("itemSubtitle")}</p>}
            {item.show("itemText") && <p className="line-clamp-2 text-xs opacity-90">{item.show("itemText")}</p>}
            <p className="text-[0.75rem] tabular-nums opacity-70">1 / {records.length}</p>
          </div>
        </div>
      );
    }
    case "shortcut_grid": {
      const items = Array.isArray(block.props.items) ? (block.props.items as { label?: string; icon?: string }[]) : [];
      return (
        <div>
          <SectionTitle>{show("title")}</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface py-3">
                <span className="font-mono text-[0.75rem] text-ink-muted">{item.icon ?? "—"}</span>
                <span className="text-[0.75rem] font-bold uppercase italic">{item.label || "Label"}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "welcome_banner":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="size-10 shrink-0 rounded-full border-2 border-primary bg-surface-raised" />
            <div>
              <p className="text-[0.75rem] font-semibold uppercase italic text-primary-ink">{show("greeting")},</p>
              <p className="text-2xl font-black uppercase italic leading-none">Tanya</p>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            {show("signedOutText") ? <>Signed out: “{show("signedOutText")}” with a Sign in button</> : "Hidden for signed-out players"}
          </p>
        </div>
      );
    case "record_actions":
      return (
        <div className="flex gap-2">
          {raw("showFavorite") !== false && <Button>♥ Favorite</Button>}
          {raw("showShare") !== false && <Button>Share</Button>}
        </div>
      );
    case "promo_card":
      return (
        <div>
          <SectionTitle>{show("sectionTitle")}</SectionTitle>
          <div className="space-y-1 rounded-xl border border-border bg-surface p-4">
            {show("eyebrow") && <p className="text-[0.75rem] font-semibold uppercase">{show("eyebrow")}</p>}
            <p className="text-lg font-black uppercase italic">{show("title") ?? "Title"}</p>
            {show("text") && <p className="text-xs text-ink-muted">{show("text")}</p>}
            {show("buttonLabel") && <Button dark>{show("buttonLabel")}</Button>}
          </div>
        </div>
      );
    case "filter_chips": {
      const field = ctx.dataFields.find((f) => f.key === block.props.field);
      const options = ctx.enumOptions(field);
      return (
        <div className="flex flex-wrap gap-1.5">
          {[String(raw("allLabel") ?? "All"), ...options.map((o) => o.name)].map((name, i) => (
            <span key={name} className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${i === 0 ? "border border-ink" : "bg-surface-raised"}`}>
              {name}
            </span>
          ))}
          {options.length === 0 && <MissingValue path={`options of ${String(block.props.field ?? "?")}`} />}
        </div>
      );
    }
    case "record_grid": {
      const records = ctx.recordsFor(listSource);
      return (
        <div>
          <div className="flex items-baseline justify-between">
            <SectionTitle>{show("title")}</SectionTitle>
            {raw("showCount") === true && <span className="text-[0.75rem] text-ink-muted tabular-nums">{records.length}</span>}
          </div>
          <FavoritesNote source={listSource} />
          {records.length === 0 ? (
            <p className="text-xs text-ink-muted">No records to show yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {records.slice(0, 6).map((record, i) => {
                const item = makeReader(block, spec, ctx, record);
                return (
                  <div key={i} className="space-y-1">
                    <PreviewImage src={assetUrl(item.raw("itemImage"))} className="aspect-square w-full rounded-md" />
                    <p className="truncate text-[0.75rem] font-bold uppercase">{item.show("itemLabel")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    case "detail_header": {
      const background = raw("imageMode") === "background" ? assetUrl(raw("image")) : null;
      return (
        <div className="relative -mx-4 -mt-4 space-y-2 overflow-hidden bg-surface-raised p-4 pt-8">
          {background && (
            <>
              <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-linear-to-b from-transparent to-page" />
            </>
          )}
          <div className="relative space-y-2">
          {show("eyebrow") && <p className="text-xs font-semibold uppercase">{show("eyebrow")}</p>}
          <p className="text-4xl font-black uppercase italic leading-none">{show("title") ?? "Title"}</p>
          {show("quote") && <p className="line-clamp-3 text-sm">“{show("quote")}”</p>}
          {show("buttonLabel") && <Button>{show("buttonLabel")}</Button>}
          </div>
        </div>
      );
    }
    case "info_list": {
      const rows = Array.isArray(block.props.rows) ? (block.props.rows as { label?: string; value?: unknown; icon?: string }[]) : [];
      return (
        <div className="space-y-2">
          <SectionTitle>{show("title")}</SectionTitle>
          {rows.map((row, i) => {
            const value = isBinding(row.value) ? resolvePath(ctx.data, bindingPath(row.value)) : row.value;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full border border-border font-mono text-[0.75rem] text-ink-muted">{row.icon ? row.icon.slice(0, 2) : "·"}</span>
                <div>
                  <p className="text-xs font-bold uppercase">{row.label || "Label"}</p>
                  <p className="text-xs font-semibold uppercase text-ink-muted">
                    {value !== undefined && value !== "" ? String(value) : isBinding(row.value) ? <MissingValue path={row.value} /> : "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case "route_timeline":
    case "gallery":
    case "tips_card": {
      const items = raw("items");
      const entries = Array.isArray(items) ? items : [];
      const itemProp = block.type === "route_timeline" ? "itemLabel" : block.type === "gallery" ? "itemImage" : "itemText";
      const title = show("title") ?? (block.type === "tips_card" ? "Tips" : null);
      if (entries.length === 0) {
        return (
          <div>
            <SectionTitle>{title}</SectionTitle>
            <p className="text-xs text-ink-muted">{isBinding(block.props.items) ? <MissingValue path={String(block.props.items)} /> : "No items"}</p>
          </div>
        );
      }
      return (
        <div className={block.type === "gallery" ? "" : "rounded-xl border border-border bg-surface p-3"}>
          <SectionTitle>{title}</SectionTitle>
          {block.type === "route_timeline" && (
            <div className="flex justify-between gap-1 border-t-2 border-border pt-2">
              {entries.slice(0, 5).map((entry, i) => (
                <span key={i} className="min-w-0 truncate text-center text-[0.75rem] font-bold uppercase">{makeReader(block, spec, ctx, entry).show(itemProp)}</span>
              ))}
            </div>
          )}
          {block.type === "gallery" && (
            <div className="flex gap-2 overflow-hidden">
              {entries.slice(0, 3).map((entry, i) => (
                <PreviewImage key={i} src={assetUrl(makeReader(block, spec, ctx, entry).raw(itemProp))} className="h-16 w-24 shrink-0 rounded-md" />
              ))}
            </div>
          )}
          {block.type === "tips_card" && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-muted">
              {entries.slice(0, 4).map((entry, i) => (
                <li key={i}>{typeof entry === "string" ? entry : makeReader(block, spec, ctx, entry).show(itemProp)}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "tab_bar":
      return (
        <div className="flex gap-4">
          {String(block.props.tabs ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t, i) => (
              <span key={t} className={`border-b-2 pb-1 text-sm font-bold uppercase italic ${i === 0 ? "border-ink" : "border-transparent text-ink-muted"}`}>
                {t}
              </span>
            ))}
        </div>
      );
    case "item_list": {
      const items = raw("items");
      return (
        <div>
          <SectionTitle>{show("title")}</SectionTitle>
          {!Array.isArray(items) || items.length === 0 ? (
            <p className="text-xs text-ink-muted">{isBinding(block.props.items) ? <MissingValue path={String(block.props.items)} /> : "No items"}</p>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 4).map((entry, i) => {
                const item = makeReader(block, spec, ctx, entry);
                return (
                  <div key={i} className="flex gap-2">
                    <span className="size-8 shrink-0 rounded-full border-2 border-ink" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase">{item.show("itemTitle")}</p>
                      {item.show("itemSubtitle") && <p className="text-[0.75rem] uppercase text-ink-muted">{item.show("itemSubtitle")}</p>}
                      {item.show("itemText") && <p className="line-clamp-2 text-[0.75rem] text-ink-muted">{item.show("itemText")}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    case "stat_row": {
      const list = stats(block, show);
      return (
        <div className="grid grid-flow-col divide-x divide-border rounded-xl border border-border bg-surface py-2 text-center">
          {list.map((s, i) => (
            <div key={i} className="px-1">
              <p className="text-base font-bold tabular-nums">{s.value}</p>
              <p className="truncate text-[0.75rem] uppercase text-ink-muted">{String(s.label ?? "")}</p>
            </div>
          ))}
        </div>
      );
    }
    case "text":
      return <p className="text-sm">{show("text") ?? <span className="text-xs text-ink-muted">No text set</span>}</p>;
    case "badge":
      return <span className="inline-flex rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold">{show("label") ?? "Badge"}</span>;
    case "cover_entity_header":
      return (
        <div className="-mx-4 -mt-4 overflow-hidden">
          <PreviewImage src={assetUrl(raw("backgroundImage"))} className="h-36 w-full" />
          <div className="space-y-1 px-4 pt-3">
            <p className="text-2xl font-bold tracking-tight">{show("title") ?? "Title"}</p>
            {show("subtitle") && <p className="text-sm text-ink-muted">{show("subtitle")}</p>}
          </div>
        </div>
      );
    default: {
      const entries = Object.keys(block.props);
      return (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="font-mono text-xs font-medium">{spec?.name ?? block.type}</p>
          {entries.length > 0 ? (
            <dl className="mt-2 space-y-1 text-xs">
              {entries.slice(0, 6).map((name) => (
                <div key={name} className="flex gap-2">
                  <dt className="shrink-0 font-mono text-ink-muted">{name}</dt>
                  <dd className="min-w-0 truncate">{show(name)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">No props set</p>
          )}
        </div>
      );
    }
  }
}

export function BlockPreview({
  block,
  spec,
  ctx,
  selected,
  onSelect,
}: {
  block: ScreenBlock;
  spec: PrimitiveSpec | undefined;
  ctx: PreviewContext;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Edit ${spec?.name ?? block.type} block`}
      aria-current={selected ? "true" : undefined}
      className={`block w-full rounded-lg text-left outline-offset-4 transition-[outline-color] duration-150 focus-visible:outline-2 focus-visible:outline-focus ${
        selected ? "outline-2 outline-primary" : "outline-1 outline-transparent hover:outline-dashed hover:outline-border-strong"
      }`}
    >
      <BlockBody block={block} spec={spec} ctx={ctx} />
    </button>
  );
}
