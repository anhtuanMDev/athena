import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  appScreenLabel,
  bindingPath,
  bindingScope,
  fieldsForProp,
  filterFields,
  isBinding,
  sourceFields,
  toBinding,
  type FieldOption,
  type PropSpec,
  type RecordSource,
  type ScreenAction,
  type SchemaInfo,
} from "~/lib/screen-model";
import { useCategories } from "~/lib/categories-context";
import { BOUND_LINK, LINK_HOSTS, isAllowedLink, type AppLimits } from "~/lib/screen-policy";

/** Field styling without a width, for controls sized by their row. */
export const inputBaseClass =
  "block rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus aria-invalid:border-danger";
export const inputClass = `${inputBaseClass} w-full`;

const monoInputClass = `${inputClass} font-mono text-xs leading-5`;

function SourceToggle({
  name,
  mode,
  onChange,
}: {
  name: string;
  mode: "value" | "field";
  onChange: (mode: "value" | "field") => void;
}) {
  return (
    <div role="group" aria-label={`Source for ${name}`} className="inline-flex rounded-lg bg-surface-raised p-0.5">
      {(["value", "field"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus pointer-coarse:py-2 ${
            mode === option ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {option === "value" ? "Value" : "Field"}
        </button>
      ))}
    </div>
  );
}

// Raw JSON for arrays and props outside the manifest. Invalid text stays in the box
// and is reported upward so the layout can't be saved half-parsed.
export function JsonInput({
  id,
  value,
  expect,
  rows = 3,
  describedBy,
  invalid,
  placeholder,
  onValid,
  onValidity,
}: {
  id: string;
  value: unknown;
  expect: "array" | "object";
  rows?: number;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  onValid: (value: unknown) => void;
  onValidity: (error: string | null) => void;
}) {
  const [text, setText] = useState(() =>
    value === undefined || (expect === "object" && Object.keys(value as object).length === 0)
      ? ""
      : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onValidity(error);
  }, [error]);

  useEffect(() => () => onValidity(null), []);

  const handleChange = (next: string) => {
    setText(next);
    if (next.trim() === "") {
      setError(null);
      onValid(expect === "array" ? undefined : {});
      return;
    }
    try {
      const parsed = JSON.parse(next);
      const ok = expect === "array" ? Array.isArray(parsed) : parsed && typeof parsed === "object" && !Array.isArray(parsed);
      if (!ok) {
        setError(expect === "array" ? "Enter a JSON array, such as [1, 2]." : "Enter a JSON object, such as {\"style\": {}}.");
        return;
      }
      setError(null);
      onValid(parsed);
    } catch {
      setError("This isn't valid JSON yet.");
    }
  };

  const errorId = `${id}-json-error`;
  return (
    <>
      <textarea
        id={id}
        rows={rows}
        spellCheck={false}
        value={text}
        placeholder={placeholder}
        aria-invalid={error || invalid ? true : undefined}
        aria-describedby={[describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        onChange={(e) => handleChange(e.target.value)}
        className={monoInputClass}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </>
  );
}

const TYPE_LABELS: Record<string, string> = {
  string: "Text",
  number: "Number",
  boolean: "true or false",
  array: "JSON array",
  data_binding: "Text, or a field",
};

function describeDefault(spec: PropSpec): string | null {
  if (spec.default === undefined || spec.default === "") return null;
  return `Default ${String(spec.default)}`;
}

const smallButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11";

export interface PropContext {
  /** Fields "data.<path>" can use on this screen. */
  dataFields: FieldOption[];
  /** Fields "item.<path>" can use; null outside list blocks. */
  itemFields: FieldOption[] | null;
  schemas: SchemaInfo[];
  screenIds: string[];
  /** Screens the app provides itself (the manifest's policy). */
  appScreens: string[];
  /** What the app drops or caps (the manifest's policy). */
  limits: AppLimits;
  icons: string[];
}

function FieldOptions({ fields, spec, scope }: { fields: FieldOption[]; spec: PropSpec; scope: "data" | "item" }) {
  const matching = fieldsForProp(fields, spec);
  const list = matching.length > 0 ? matching : fields;
  return (
    <>
      {list.map((f) => (
        <option key={`${scope}:${f.key}`} value={`${scope}:${f.key}`}>
          {f.label && f.label !== f.key ? `${f.label} (${f.key})` : f.key} · {f.type}
        </option>
      ))}
    </>
  );
}

/** Which records a list block (or a list screen) shows. */
export function SourceInput({
  id,
  value,
  onChange,
  schemas,
  limits,
  emptyLabel = "The screen's records",
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  schemas: SchemaInfo[];
  limits: AppLimits;
  /** The category option for no source. */
  emptyLabel?: string;
}) {
  const source = (value && typeof value === "object" ? value : {}) as Partial<RecordSource>;
  const configured = useCategories();
  const categories = configured.filter((c) => schemas.some((s) => s.category === c.category));
  const fields = source.category ? sourceFields(schemas, { category: source.category }) : [];
  // The app saves favorites only for favoritable categories, so a favorites list of another is always empty.
  const favoritable = configured.find((c) => c.category === source.category)?.favoritable === true;
  const overLimit = typeof source.limit === "number" && source.limit > limits.listItems;
  const update = (patch: Partial<RecordSource>) => {
    const next = { ...source, ...patch };
    for (const key of Object.keys(next) as (keyof RecordSource)[]) {
      if (next[key] === undefined || next[key] === "") delete next[key];
    }
    onChange(next.category ? next : undefined);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* Another category's fields and favorites don't carry over. */}
      <select id={id} aria-label="Category" value={source.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined, schema: undefined, sort: undefined, order: undefined, favorites: undefined })} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {categories.map((c) => (
          <option key={c.category} value={c.category}>{c.label}</option>
        ))}
      </select>
      <select aria-label="Schema" value={source.schema ?? ""} disabled={!source.category} onChange={(e) => update({ schema: e.target.value || undefined })} className={inputClass}>
        <option value="">Every schema</option>
        {schemas.filter((s) => s.category === source.category).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select aria-label="Sort by" value={source.sort ?? ""} disabled={!source.category} onChange={(e) => update({ sort: e.target.value || undefined })} className={inputClass}>
        <option value="">File order</option>
        {fields.filter((f) => f.type === "string" || f.type === "number" || f.type === "enum").map((f) => (
          <option key={f.key} value={f.key}>Sort by {f.label ?? f.key}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <select aria-label="Order" value={source.order ?? "asc"} disabled={!source.sort} onChange={(e) => update({ order: e.target.value === "desc" ? "desc" : undefined })} className={inputClass}>
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>
        <input aria-label="Show at most" type="number" min={1} max={limits.listItems} inputMode="numeric" placeholder={`All, up to ${limits.listItems}`} value={source.limit ?? ""} disabled={!source.category} aria-invalid={overLimit || undefined} onChange={(e) => update({ limit: e.target.value ? Number(e.target.value) : undefined })} className={`${inputBaseClass} w-28 tabular-nums`} />
      </div>
      {overLimit && <p className="col-span-2 text-xs text-danger-ink">The app shows at most {limits.listItems} records.</p>}
      {(favoritable || source.favorites) && (
        <select aria-label="Whose records" value={source.favorites ? "favorites" : ""} disabled={!source.category} aria-invalid={(source.favorites && !favoritable) || undefined} onChange={(e) => update({ favorites: e.target.value === "favorites" || undefined })} className={`${inputClass} col-span-2`}>
          <option value="">All records</option>
          <option value="favorites">Only the player's favorites (hidden when signed out)</option>
        </select>
      )}
      {source.favorites && !favoritable && (
        <p className="col-span-2 text-xs text-danger-ink">Players can't favorite these records, so this list would always be empty: choose All records.</p>
      )}
    </div>
  );
}

/** What tapping does: open a screen of this game or of the app, a link, or a link read from the record. */
function ActionInput({
  id,
  value,
  onChange,
  screenIds,
  appScreens,
  linkFields,
  describedBy,
  label,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  screenIds: string[];
  appScreens: string[];
  /** The control's name when no <label> points at `id` (a tile's action). */
  label?: string;
  /** Text fields a link can be read from: "item.<key>" in list blocks, "data.<key>" for the screen's record. */
  linkFields: string[];
  describedBy?: string;
}) {
  const action = (value && typeof value === "object" ? value : {}) as ScreenAction;
  const boundUrl = action.url !== undefined && BOUND_LINK.test(action.url) ? action.url : undefined;
  const mode = boundUrl ? "field" : action.url !== undefined ? "url" : action.screen ? `screen:${action.screen}` : "";
  return (
    <div className="space-y-2">
      <select
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : v === "url" ? { url: "" } : v === "field" ? { url: linkFields[0] } : { screen: v.slice("screen:".length) });
        }}
        className={inputClass}
      >
        <option value="">Nothing</option>
        {action.screen && !screenIds.includes(action.screen) && !appScreens.includes(action.screen) && <option value={`screen:${action.screen}`}>{action.screen} (missing)</option>}
        {screenIds.map((s) => (
          <option key={s} value={`screen:${s}`}>Open screen: {s}</option>
        ))}
        {appScreens.map((s) => (
          <option key={s} value={`screen:${s}`}>Open: {appScreenLabel(s)}</option>
        ))}
        <option value="url">Open a link…</option>
        {(boundUrl || linkFields.length > 0) && <option value="field">Open a link from the record…</option>}
      </select>
      {boundUrl && (
        <>
          <select aria-label="Link field" value={boundUrl} onChange={(e) => onChange({ url: e.target.value })} className={inputClass}>
            {!linkFields.includes(boundUrl) && <option value={boundUrl}>{boundUrl} (not found)</option>}
            {linkFields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <p className="text-xs text-ink-muted">
            The app reads the link from this field and opens it only if it is https on {LINK_HOSTS.join(", ")} (or their subdomains).
          </p>
        </>
      )}
      {mode === "url" && (
        <>
          <input
            aria-label="Link"
            type="url"
            placeholder="https://"
            value={action.url ?? ""}
            aria-invalid={action.url && !isAllowedLink(action.url) ? true : undefined}
            onChange={(e) => onChange({ url: e.target.value })}
            className={inputClass}
          />
          <p className={`text-xs ${action.url && !isAllowedLink(action.url) ? "text-danger-ink" : "text-ink-muted"}`}>
            The app only opens https links on {LINK_HOSTS.join(", ")} (and their subdomains), after asking the player.
          </p>
        </>
      )}
    </div>
  );
}

interface Shortcut {
  label: string;
  icon?: string;
  screen?: string;
  url?: string;
}

/** Quick-access tiles: label, icon, and what each opens (a screen, the app's settings, or a link). */
function ShortcutsInput({
  id,
  value,
  onChange,
  screenIds,
  appScreens,
  linkFields,
  icons,
  max,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  screenIds: string[];
  appScreens: string[];
  linkFields: string[];
  icons: string[];
  /** The app shows this many tiles at most. */
  max: number;
}) {
  const items: Shortcut[] = Array.isArray(value) ? (value as Shortcut[]) : [];
  const set = (next: Shortcut[]) => onChange(next.length > 0 ? next : undefined);
  const patch = (i: number, p: Partial<Shortcut>) =>
    set(
      items.map((item, j) => {
        if (j !== i) return item;
        const next = { ...item, ...p };
        for (const key of Object.keys(p) as (keyof Shortcut)[]) if (next[key] === undefined) delete next[key];
        return next;
      }),
    );
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  return (
    <div id={id} className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2">
          <input aria-label={`Tile ${i + 1} label`} value={item.label ?? ""} placeholder="Label" onChange={(e) => patch(i, { label: e.target.value })} className={`${inputBaseClass} min-w-32 flex-1`} />
          <select aria-label={`Tile ${i + 1} icon`} value={item.icon ?? ""} onChange={(e) => patch(i, { icon: e.target.value || undefined })} className={`${inputBaseClass} w-36`}>
            <option value="">No icon</option>
            {icons.map((icon) => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
          <div className="w-full sm:w-64">
            {/* The app opens a tile's screen if it has one, else its link (zms sanitize.ts), so a tile keeps one of them. */}
            <ActionInput
              id={`${id}-tile-${i}-action`}
              label={`Tile ${i + 1} opens`}
              value={item.screen !== undefined || item.url !== undefined ? { screen: item.screen, url: item.url } : undefined}
              onChange={(v) => {
                const action = (v ?? {}) as ScreenAction;
                patch(i, { screen: action.screen, url: action.screen ? undefined : action.url });
              }}
              screenIds={screenIds}
              appScreens={appScreens}
              linkFields={linkFields}
            />
          </div>
          <div className="flex">
            <button type="button" aria-label={`Move tile ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className={smallButtonClass}><ArrowUp aria-hidden="true" className="size-4" /></button>
            <button type="button" aria-label={`Move tile ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={smallButtonClass}><ArrowDown aria-hidden="true" className="size-4" /></button>
            <button type="button" aria-label={`Remove tile ${i + 1}`} onClick={() => set(items.filter((_, j) => j !== i))} className={smallButtonClass}><Trash2 aria-hidden="true" className="size-4" /></button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set([...items, { label: "", icon: icons[0], screen: screenIds[0] }])}
        disabled={items.length >= max}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add tile
      </button>
      {items.length >= max && <p className="text-xs text-ink-muted">The app shows {max} tiles at most.</p>}
    </div>
  );
}

interface InfoRow {
  label: string;
  value?: string;
  icon?: string;
}

/** Info rows: label, icon, and a field (or fixed text) for the value. */
function InfoRowsInput({
  id,
  value,
  onChange,
  dataFields,
  icons,
  max,
}: {
  id: string;
  value: unknown;
  onChange: (v: unknown) => void;
  dataFields: FieldOption[];
  icons: string[];
  /** The app shows this many rows at most. */
  max: number;
}) {
  const rows: InfoRow[] = Array.isArray(value) ? (value as InfoRow[]) : [];
  const set = (next: InfoRow[]) => onChange(next.length > 0 ? next : undefined);
  const patch = (i: number, p: Partial<InfoRow>) => set(rows.map((row, j) => (j === i ? { ...row, ...p } : row)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const scalarFields = fieldsForProp(dataFields, { type: "string" });
  return (
    <div id={id} className="space-y-2">
      {rows.map((row, i) => {
        const bound = isBinding(row.value);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
            <input aria-label={`Row ${i + 1} label`} value={row.label ?? ""} placeholder="Label" onChange={(e) => patch(i, { label: e.target.value })} className={`${inputBaseClass} min-w-0 flex-1`} />
            <select aria-label={`Row ${i + 1} icon`} value={row.icon ?? ""} onChange={(e) => patch(i, { icon: e.target.value || undefined })} className={`${inputBaseClass} w-32`}>
              <option value="">No icon</option>
              {icons.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
            <select
              aria-label={`Row ${i + 1} value from`}
              value={bound ? row.value : ""}
              onChange={(e) => patch(i, { value: e.target.value || "" })}
              className={`${inputBaseClass} w-48`}
            >
              <option value="">Fixed text</option>
              {bound && !scalarFields.some((f) => `data.${f.key}` === row.value) && <option value={row.value}>{row.value} (not found)</option>}
              {scalarFields.map((f) => (
                <option key={f.key} value={`data.${f.key}`}>Field: {f.label ?? f.key}</option>
              ))}
            </select>
            {!bound && (
              <input aria-label={`Row ${i + 1} text`} value={row.value ?? ""} placeholder="Value" onChange={(e) => patch(i, { value: e.target.value })} className={`${inputBaseClass} w-36`} />
            )}
            <div className="flex">
              <button type="button" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className={smallButtonClass}><ArrowUp aria-hidden="true" className="size-4" /></button>
              <button type="button" aria-label={`Move row ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={smallButtonClass}><ArrowDown aria-hidden="true" className="size-4" /></button>
              <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => set(rows.filter((_, j) => j !== i))} className={smallButtonClass}><Trash2 aria-hidden="true" className="size-4" /></button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => set([...rows, { label: "", icon: icons[0], value: scalarFields[0] ? `data.${scalarFields[0].key}` : "" }])}
        disabled={rows.length >= max}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Plus aria-hidden="true" className="size-4" />
        Add row
      </button>
      {rows.length >= max && <p className="text-xs text-ink-muted">The app shows {max} rows at most.</p>}
    </div>
  );
}

/** Text fields an action can read a link from: each entry's in list blocks, then the screen's record. */
function linkFields({ itemFields, dataFields }: PropContext): string[] {
  const text = (fields: FieldOption[], scope: "data" | "item") => fields.filter((f) => f.type === "string").map((f) => toBinding(scope, f.key));
  return [...text(itemFields ?? [], "item"), ...text(dataFields, "data")];
}

const SPECIAL_HELP: Record<string, string> = {
  source: "Which records this block lists. Empty uses the screen's records.",
  action: "What tapping does.",
  shortcuts: "Tiles in order, each opening a screen, the app's settings or a link.",
  field_key: "The field whose values become the chips; they filter this screen's lists.",
  info_rows: "Rows in order: a label, an icon, and the field (or fixed text) shown as the value.",
};

export function PropControl({
  idBase,
  name,
  spec,
  value,
  context,
  error,
  onChange,
  onJsonValidity,
}: {
  idBase: string;
  name: string;
  spec: PropSpec;
  value: unknown;
  context: PropContext;
  error?: string;
  onChange: (value: unknown) => void;
  onJsonValidity: (error: string | null) => void;
}) {
  const { dataFields, itemFields } = context;
  const [mode, setMode] = useState<"value" | "field">(
    isBinding(value) || (itemFields && value === undefined && /^item[A-Z]/.test(name)) ? "field" : "value",
  );
  const inputId = `${idBase}-${name}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = [helpId, error ? errorId : null].filter(Boolean).join(" ");
  const defaultText = describeDefault(spec);

  if (spec.type === "node") {
    return (
      <div>
        <p className="font-mono text-xs font-medium text-ink">{name}</p>
        <p className="mt-1 text-xs text-ink-muted">React content the app supplies itself; a screen can't set it.</p>
      </div>
    );
  }

  const special = SPECIAL_HELP[spec.type];
  const label = (
    <label htmlFor={inputId} className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-mono text-xs font-medium text-ink">{name}</span>
      {spec.required && <span className="text-xs text-ink-muted">required</span>}
    </label>
  );
  const footer = (
    <>
      <p id={helpId} className="mt-1 text-xs text-ink-muted">
        {special ??
          (mode === "field"
            ? "Read from the data when the app renders."
            : [spec.options?.length ? "One of the app's values" : (TYPE_LABELS[spec.type] ?? spec.type), defaultText]
                .filter(Boolean)
                .join(" · "))}
      </p>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </>
  );

  if (special) {
    let control: React.ReactNode;
    if (spec.type === "source") control = <SourceInput id={inputId} value={value} onChange={onChange} schemas={context.schemas} limits={context.limits} />;
    else if (spec.type === "action") control = <ActionInput id={inputId} value={value} onChange={onChange} screenIds={context.screenIds} appScreens={context.appScreens} linkFields={linkFields(context)} describedBy={describedBy} />;
    else if (spec.type === "shortcuts") {
      // A tile isn't an entry of a list, so only the screen's data can give it a link.
      const tileLinks = linkFields({ ...context, itemFields: null });
      control = <ShortcutsInput id={inputId} value={value} onChange={onChange} screenIds={context.screenIds} appScreens={context.appScreens} linkFields={tileLinks} icons={context.icons} max={context.limits.smallList} />;
    } else if (spec.type === "info_rows") control = <InfoRowsInput id={inputId} value={value} onChange={onChange} dataFields={dataFields} icons={context.icons} max={context.limits.smallList} />;
    else {
      const current = typeof value === "string" ? value : "";
      const choices = filterFields(dataFields);
      control = (
        <select id={inputId} value={current} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value || undefined)} className={inputClass}>
          <option value="">Choose a field…</option>
          {current && !choices.some((f) => f.key === current) && <option value={current}>{current} (not an option field)</option>}
          {choices.map((f) => (
            <option key={f.key} value={f.key}>{f.label ?? f.key}</option>
          ))}
        </select>
      );
    }
    return (
      <div className="md:col-span-2">
        <div className="mb-1.5">{label}</div>
        {control}
        {footer}
      </div>
    );
  }

  const switchMode = (next: "value" | "field") => {
    if (next === mode) return;
    setMode(next);
    onChange(undefined);
  };

  let control: React.ReactNode;
  if (mode === "field") {
    const current = isBinding(value) ? `${bindingScope(value)}:${bindingPath(value)}` : "";
    const known = [...(itemFields ?? []).map((f) => `item:${f.key}`), ...dataFields.map((f) => `data:${f.key}`)];
    control = (
      <select
        id={inputId}
        value={current}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onChange(undefined);
          const [scope, ...rest] = v.split(":");
          onChange(toBinding(scope === "item" ? "item" : "data", rest.join(":")));
        }}
        className={inputClass}
      >
        <option value="">Choose a field…</option>
        {current && !known.includes(current) && <option value={current}>{current.replace(":", ".")} (not found)</option>}
        {itemFields && itemFields.length > 0 && (
          <optgroup label="Each entry (item.)">
            <FieldOptions fields={itemFields} spec={spec} scope="item" />
          </optgroup>
        )}
        {dataFields.length > 0 && (
          <optgroup label={itemFields ? "Screen data (data.)" : "Fields (data.)"}>
            <FieldOptions fields={dataFields} spec={spec} scope="data" />
          </optgroup>
        )}
      </select>
    );
  } else if (spec.options && spec.options.length > 0) {
    const current = typeof value === "string" ? value : "";
    control = (
      <select id={inputId} value={current} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} className={inputClass}>
        <option value="">{defaultText ? `${defaultText} (app default)` : "Not set"}</option>
        {current && !spec.options.includes(current) && <option value={current}>{current} (not offered by the app)</option>}
        {spec.options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  } else if (spec.type === "boolean") {
    control = (
      <select id={inputId} value={value === true ? "true" : value === false ? "false" : ""} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")} className={inputClass}>
        <option value="">{defaultText ? `${defaultText} (app default)` : "Not set"}</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (spec.type === "array") {
    control = <JsonInput id={inputId} value={value} expect="array" describedBy={describedBy} invalid={Boolean(error)} placeholder="[]" onValid={onChange} onValidity={onJsonValidity} />;
  } else if (spec.type === "number") {
    control = (
      <input id={inputId} type="number" inputMode="decimal" value={typeof value === "number" ? value : ""} placeholder={spec.default !== undefined ? String(spec.default) : undefined} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className={`${inputClass} tabular-nums`} />
    );
  } else {
    control = (
      <input id={inputId} type="text" autoComplete="off" spellCheck={false} value={typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value)} placeholder={spec.default !== undefined ? String(spec.default) : undefined} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} className={inputClass} />
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        {label}
        <SourceToggle name={name} mode={mode} onChange={switchMode} />
      </div>
      {control}
      {footer}
    </div>
  );
}
