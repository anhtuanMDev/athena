import React, { forwardRef, useEffect, useId, useState } from "react";
import { linesToList } from "~/lib/schema-utils";

interface DynamicSelectFieldProps extends Omit<React.InputHTMLAttributes<HTMLSelectElement | HTMLInputElement>, 'size' | 'value'> {
  name: string;
  label: string;
  options: string[];
  multiple?: boolean;
  required?: boolean;
  currentValue?: unknown;
  error?: boolean;
  helperText?: string;
  value?: string | number | readonly string[] | unknown;
}

/**
 * A list field without options: its values typed one per line. The text is kept
 * as typed, so a new line can be started; the list it stands for is what's saved.
 */
function FreeListInput({
  id,
  name,
  values,
  error,
  describedBy,
  onChange,
  onBlur,
}: {
  id: string;
  name: string;
  values: string[];
  error?: boolean;
  describedBy?: string;
  onChange?: (values: string[]) => void;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState(values.join("\n"));
  // A reset of the form (a record loading) replaces the text; typing doesn't.
  const joined = values.join("\n");
  useEffect(() => {
    if (linesToList(text).join("\n") !== joined) setText(joined);
  }, [joined]);
  return (
    <textarea
      id={id}
      name={name}
      rows={Math.min(Math.max(values.length + 1, 3), 8)}
      value={text}
      placeholder="One value per line"
      aria-invalid={error || undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        setText(e.target.value);
        onChange?.(linesToList(e.target.value));
      }}
      onBlur={onBlur}
      className={`mt-1 block w-full rounded-md border ${error ? "border-red-500" : "border-border-strong"} bg-surface px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
    />
  );
}

export const DynamicSelectField = forwardRef<HTMLInputElement & HTMLSelectElement, DynamicSelectFieldProps>(
  ({ name, label, options, multiple = false, required = false, currentValue, error, helperText, value, ...props }, ref) => {
    // Check if current value exists but is not in options
    const actualValue = value !== undefined ? value : currentValue;
    const valArray = Array.isArray(actualValue) ? actualValue : (actualValue ? [actualValue] : []);
    const hasInvalidOldData = valArray.some(v => v && !options.includes(String(v)));
    const generatedId = useId();
    const fieldId = (props.id as string | undefined) ?? generatedId;
    const labelId = `${fieldId}-label`;
    const helpId = `${fieldId}-help`;
    
    return (
      <div>
        <label id={labelId} htmlFor={multiple && options.length > 0 ? undefined : fieldId} className={`block text-sm font-medium ${error ? 'text-red-500' : 'text-ink'}`}>
          {label}
          {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
        </label>
        {hasInvalidOldData && options.length > 0 && (
          <p className="text-xs text-orange-500 dark:text-orange-400 mt-1 mb-1">
            Warning: Old data contained "{valArray.join(", ")}" which is no longer valid. Please select a new option.
          </p>
        )}
        {multiple && options.length === 0 ? (
          // Nothing to tick: the schema gives this list no options, so its values are typed.
          <FreeListInput
            id={fieldId}
            name={name}
            values={valArray.map(String)}
            error={error}
            describedBy={error && helperText ? helpId : undefined}
            onChange={props.onChange as ((values: string[]) => void) | undefined}
            onBlur={props.onBlur as React.FocusEventHandler<HTMLTextAreaElement> | undefined}
          />
        ) : multiple ? (
          <div role="group" aria-labelledby={labelId} className="mt-2 space-y-2">
            {options.map((opt) => (
              <label key={opt} className="inline-flex items-center mr-4">
                <input
                  type="checkbox"
                  name={name}
                  value={opt}
                  checked={valArray.includes(opt)}
                  className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${error ? 'border-red-500' : ''}`}
                  ref={ref as React.Ref<HTMLInputElement>}
                  {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => {
                    if (props.onChange) {
                      const isChecked = e.target.checked;
                      let newArray = [...valArray];
                      if (isChecked) {
                        newArray.push(opt);
                      } else {
                        newArray = newArray.filter(v => v !== opt);
                      }
                      (props.onChange as any)(newArray);
                    }
                  }}
                />
                <span className="ml-2 text-sm text-ink">{opt}</span>
              </label>
            ))}
          </div>
        ) : (
            <select
            name={name}
            required={required}
            className={`mt-1 block w-full rounded-md border ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border-strong focus:border-blue-500 focus:ring-blue-500'} bg-surface px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 dark:text-gray-100 ${error ? 'dark:border-red-500' : ''}`}
            ref={ref as React.Ref<HTMLSelectElement>}
            {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
            id={fieldId}
            aria-invalid={error || undefined}
            aria-describedby={error && helperText ? helpId : undefined}
            value={actualValue as string | number | readonly string[] | undefined || ""}
          >
            <option value="" disabled>Select an option</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
        {error && helperText && (
          <p id={helpId} className="mt-1 text-xs text-red-500">{helperText}</p>
        )}
      </div>
    );
  }
);
