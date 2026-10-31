import { useEffect, useState } from "react";
import {
  bindingPath,
  fieldsForProp,
  isBinding,
  toBinding,
  type FieldOption,
  type PropSpec,
} from "~/lib/layout-model";

export const inputClass =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus aria-invalid:border-danger";

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

export function PropControl({
  idBase,
  name,
  spec,
  value,
  fields,
  error,
  onChange,
  onJsonValidity,
}: {
  idBase: string;
  name: string;
  spec: PropSpec;
  value: unknown;
  fields: FieldOption[];
  error?: string;
  onChange: (value: unknown) => void;
  onJsonValidity: (error: string | null) => void;
}) {
  const [mode, setMode] = useState<"value" | "field">(isBinding(value) ? "field" : "value");
  const inputId = `${idBase}-${name}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = [helpId, error ? errorId : null].filter(Boolean).join(" ");
  const defaultText = describeDefault(spec);

  if (spec.type === "node") {
    return (
      <div>
        <p className="font-mono text-xs font-medium text-ink">{name}</p>
        <p className="mt-1 text-xs text-ink-muted">React content the app supplies itself; a layout file can't set it.</p>
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
    const matching = fieldsForProp(fields, spec);
    const others = fields.filter((f) => !matching.includes(f));
    const current = isBinding(value) ? bindingPath(value) : "";
    const missing = current && !fields.some((f) => f.key === current);
    control = (
      <select
        id={inputId}
        value={current}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value ? toBinding(e.target.value) : undefined)}
        className={inputClass}
      >
        <option value="">Choose a field…</option>
        {missing && <option value={current}>{current} (not in schema)</option>}
        {matching.map((f) => (
          <option key={f.key} value={f.key}>
            {f.key} ({f.type})
          </option>
        ))}
        {others.length > 0 && matching.length > 0 && (
          <optgroup label="Other fields">
            {others.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key} ({f.type})
              </option>
            ))}
          </optgroup>
        )}
        {matching.length === 0 &&
          others.map((f) => (
            <option key={f.key} value={f.key}>
              {f.key} ({f.type})
            </option>
          ))}
      </select>
    );
  } else if (spec.type === "boolean") {
    control = (
      <select
        id={inputId}
        value={value === true ? "true" : value === false ? "false" : ""}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
        className={inputClass}
      >
        <option value="">{defaultText ? `${defaultText} (app default)` : "Not set"}</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (spec.type === "array") {
    control = (
      <JsonInput
        id={inputId}
        value={value}
        expect="array"
        describedBy={describedBy}
        invalid={Boolean(error)}
        placeholder="[]"
        onValid={onChange}
        onValidity={onJsonValidity}
      />
    );
  } else if (spec.type === "number") {
    control = (
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        value={typeof value === "number" ? value : ""}
        placeholder={spec.default !== undefined ? String(spec.default) : undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={`${inputClass} tabular-nums`}
      />
    );
  } else {
    control = (
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value)}
        placeholder={spec.default !== undefined ? String(spec.default) : undefined}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        className={inputClass}
      />
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-xs font-medium text-ink">{name}</span>
          {spec.required && <span className="text-xs text-ink-muted">required</span>}
        </label>
        <SourceToggle name={name} mode={mode} onChange={switchMode} />
      </div>
      {control}
      <p id={helpId} className="mt-1 text-xs text-ink-muted">
        {mode === "field"
          ? "Read from each record when the app renders."
          : [TYPE_LABELS[spec.type] ?? spec.type, defaultText].filter(Boolean).join(" · ")}
      </p>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
