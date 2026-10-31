import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";
import {
  bindingPath,
  isBinding,
  resolveProp,
  type LayoutSection,
  type PrimitiveSpec,
} from "~/lib/layout-model";

// A sketch of what each app component receives, not the app's own styling.

type Data = Record<string, unknown> | null;

function MissingValue({ path }: { path: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded border border-dashed border-border-strong px-1.5 font-mono text-[0.75rem] font-normal text-ink-muted">
      <span className="truncate">{path}</span>
    </span>
  );
}

function makeReader(section: LayoutSection, spec: PrimitiveSpec | undefined, data: Data) {
  const raw = (name: string): unknown => {
    const value = resolveProp(section.props[name], data);
    if (value !== undefined && value !== null && value !== "") return value;
    if (isBinding(section.props[name])) return undefined;
    return spec?.props[name]?.default;
  };
  const show = (name: string): ReactNode => {
    const value = raw(name);
    if (value !== undefined && value !== null && value !== "") {
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    const prop = section.props[name];
    return isBinding(prop) ? <MissingValue path={bindingPath(prop)} /> : null;
  };
  return { raw, show };
}

export function assetUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/^https?:\/\//.test(value) || value.startsWith("/")) return value;
  if (value.startsWith("assets/")) return `/api/${value}`;
  return null;
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

function textVariantClass(variant: unknown): string {
  const v = String(variant ?? "").toLowerCase();
  if (/h1|display|headline|hero/.test(v)) return "text-2xl font-bold tracking-tight";
  if (/h2|h3|title|heading/.test(v)) return "text-lg font-semibold";
  if (/caption|small|label|overline/.test(v)) return "text-xs text-ink-muted";
  return "text-sm";
}

function MetricItems({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="text-xs text-ink-muted">No items</p>;
  }
  return (
    <div className="flex gap-2 overflow-hidden">
      {items.slice(0, 4).map((item, i) => {
        const entry: Record<string, unknown> = item && typeof item === "object" ? (item as Record<string, unknown>) : { value: item };
        const values = Object.values(entry).filter((v) => typeof v === "string" || typeof v === "number");
        const label = entry.label ?? entry.title ?? entry.name ?? values[1];
        const value = entry.value ?? values[0];
        return (
          <div key={i} className="min-w-0 flex-1 rounded-lg bg-surface-raised px-2 py-1.5">
            <p className="truncate text-sm font-semibold tabular-nums">{String(value ?? "–")}</p>
            {label !== undefined && <p className="truncate text-xs text-ink-muted">{String(label)}</p>}
          </div>
        );
      })}
    </div>
  );
}

function BlockBody({ section, spec, data }: { section: LayoutSection; spec: PrimitiveSpec | undefined; data: Data }) {
  const { raw, show } = makeReader(section, spec, data);

  switch (section.type) {
    case "badge": {
      const color = typeof raw("color") === "string" ? (raw("color") as string) : undefined;
      const textColor = typeof raw("textColor") === "string" ? (raw("textColor") as string) : undefined;
      return (
        <span
          className="inline-flex rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: color, color: textColor }}
        >
          {show("label") ?? "Badge"}
        </span>
      );
    }
    case "button": {
      const secondary = /secondary|outline|ghost/.test(String(raw("variant") ?? ""));
      return (
        <span
          className={`flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold ${
            secondary ? "border border-border-strong text-ink" : "bg-ink text-page"
          }`}
        >
          {show("title") ?? "Button"}
        </span>
      );
    }
    case "card":
      return (
        <div className="rounded-xl border border-border bg-surface p-4 text-xs text-ink-muted">
          Card content comes from the app.
        </div>
      );
    case "cover_entity_header": {
      const centered = raw("alignment") === "center";
      return (
        <div className="-mx-4 -mt-4 overflow-hidden">
          <PreviewImage src={assetUrl(raw("backgroundImage"))} className="h-44 w-full" />
          <div className={`space-y-1 px-4 pt-3 ${centered ? "text-center" : ""}`}>
            <p className="text-2xl font-bold tracking-tight">{show("title") ?? "Title"}</p>
            {show("subtitle") && <p className="text-sm text-ink-muted">{show("subtitle")}</p>}
            {show("quote") && <p className="text-sm italic text-ink-muted">“{show("quote")}”</p>}
          </div>
        </div>
      );
    }
    case "empty_state":
    case "error_state": {
      const isError = section.type === "error_state";
      return (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center">
          {!isError && <p className="text-sm font-semibold">{show("title")}</p>}
          <p className="mt-1 text-xs text-ink-muted">{show("message")}</p>
          {isError && <span className="mt-3 inline-flex rounded-lg border border-border-strong px-3 py-1 text-xs font-medium">Retry</span>}
        </div>
      );
    }
    case "feature_row_card": {
      const imageLeft = raw("imagePosition") === "left";
      return (
        <div className={`flex gap-3 rounded-xl border border-border bg-surface p-3 ${imageLeft ? "flex-row-reverse" : ""}`}>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold">{show("title") ?? "Title"}</p>
            {show("subtitle") && <p className="text-xs text-ink-muted">{show("subtitle")}</p>}
            <p className="line-clamp-3 text-xs text-ink-muted">{show("description")}</p>
          </div>
          <PreviewImage src={assetUrl(raw("image"))} className="size-16 shrink-0 rounded-lg" />
        </div>
      );
    }
    case "gradient_card":
      return (
        <div className="space-y-1 rounded-xl bg-surface-raised p-4">
          <p className="text-sm font-semibold">{show("title") ?? "Title"}</p>
          <p className="line-clamp-3 text-xs text-ink-muted">{show("description")}</p>
          {show("footerText") && <p className="pt-2 text-xs font-medium">{show("footerText")}</p>}
        </div>
      );
    case "horizontal_metric_row":
      return isBinding(section.props.items) && raw("items") === undefined ? (
        <MissingValue path={bindingPath(section.props.items as string)} />
      ) : (
        <MetricItems items={raw("items")} />
      );
    case "linear_progress_card": {
      const current = Number(raw("currentXp"));
      const max = Number(raw("maxXp"));
      const ratio = Number.isFinite(current) && Number.isFinite(max) && max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
      return (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{show("title") ?? "Title"}</p>
            {show("level") && <p className="text-xs text-ink-muted">Level {show("level")}</p>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-ink" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="text-xs tabular-nums text-ink-muted">
            {show("currentXp") ?? "–"} / {show("maxXp") ?? "–"} XP
          </p>
        </div>
      );
    }
    case "skeleton": {
      const height = Number(raw("height"));
      const radius = Number(raw("borderRadius"));
      const width = raw("width");
      return (
        <div
          className="bg-surface-raised"
          style={{
            height: Number.isFinite(height) && height > 0 ? Math.min(height, 240) : 16,
            width: typeof width === "number" ? Math.min(width, 343) : typeof width === "string" ? width : "100%",
            borderRadius: Number.isFinite(radius) ? radius : 6,
          }}
        />
      );
    }
    case "text": {
      const contentProp = ["children", "text", "content", "value"].find((name) => section.props[name] !== undefined);
      return (
        <p
          className={textVariantClass(raw("variant"))}
          style={{ textAlign: (raw("align") as React.CSSProperties["textAlign"]) ?? undefined }}
        >
          {contentProp ? show(contentProp) : <span className="text-xs text-ink-muted">No text set. The manifest gives Text no content prop.</span>}
        </p>
      );
    }
    default: {
      const entries = Object.keys(section.props);
      return (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="font-mono text-xs font-medium">{spec?.name ?? section.type}</p>
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
  section,
  spec,
  data,
  selected,
  onSelect,
}: {
  section: LayoutSection;
  spec: PrimitiveSpec | undefined;
  data: Data;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Edit ${spec?.name ?? section.type} block`}
      aria-current={selected ? "true" : undefined}
      className={`block w-full rounded-lg text-left outline-offset-4 transition-[outline-color] duration-150 focus-visible:outline-2 focus-visible:outline-focus ${
        selected ? "outline-2 outline-primary" : "outline-1 outline-transparent hover:outline-dashed hover:outline-border-strong"
      }`}
    >
      <BlockBody section={section} spec={spec} data={data} />
    </button>
  );
}
