import { useEffect, useEffectEvent, useState } from "react";

import { JSON_ROWS, monoInputClass } from "../constants";
import { jsonText, parseJsonText, type JsonShape } from "../utils/prop-values";

interface JsonInputProps {
  /** The box: its id, what describes it, whether its prop has an error, and its placeholder. */
  box: { id: string; describedBy?: string; invalid?: boolean; placeholder?: string; rows?: number };
  value: unknown;
  expect: JsonShape;
  onValid: (value: unknown) => void;
  onValidity: (error: string | null) => void;
}

// Raw JSON for arrays and props outside the manifest. Invalid text stays in the box
// and is reported upward so the layout can't be saved half-parsed.
export function JsonInput({ box, value, expect, onValid, onValidity }: JsonInputProps) {
  const [text, setText] = useState(() => jsonText(value, expect));
  const [error, setError] = useState<string | null>(null);
  const report = useEffectEvent(onValidity);

  useEffect(() => {
    report(error);
  }, [error]);

  useEffect(
    () => () => {
      report(null);
    },
    [],
  );

  const handleChange = (next: string) => {
    setText(next);
    const result = parseJsonText(next, expect);
    setError(result.error);
    if (result.error === null) {
      onValid(result.value);
    }
  };

  const errorId = `${box.id}-json-error`;
  return (
    <>
      <textarea
        id={box.id}
        rows={box.rows ?? JSON_ROWS}
        spellCheck={false}
        value={text}
        placeholder={box.placeholder}
        aria-invalid={error || box.invalid ? true : undefined}
        aria-describedby={[box.describedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined}
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
