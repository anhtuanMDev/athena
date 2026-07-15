import React, { forwardRef } from "react";

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

export const DynamicSelectField = forwardRef<HTMLInputElement & HTMLSelectElement, DynamicSelectFieldProps>(
  ({ name, label, options, multiple = false, required = false, currentValue, error, helperText, value, ...props }, ref) => {
    // Check if current value exists but is not in options
    const actualValue = value !== undefined ? value : currentValue;
    const valArray = Array.isArray(actualValue) ? actualValue : (actualValue ? [actualValue] : []);
    const hasInvalidOldData = valArray.some(v => v && !options.includes(String(v)));
    
    return (
      <div>
        <label className={`block text-sm font-medium ${error ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {hasInvalidOldData && (
          <p className="text-xs text-orange-500 dark:text-orange-400 mt-1 mb-1">
            Warning: Old data contained "{valArray.join(", ")}" which is no longer valid. Please select a new option.
          </p>
        )}
        {multiple ? (
          <div className="mt-2 space-y-2">
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
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
              </label>
            ))}
          </div>
        ) : (
            <select
            name={name}
            required={required}
            className={`mt-1 block w-full rounded-md border ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'} bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100 ${error ? 'dark:border-red-500' : 'dark:border-gray-600'}`}
            ref={ref as React.Ref<HTMLSelectElement>}
            {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
            value={actualValue as string | number | readonly string[] | undefined || ""}
          >
            <option value="" disabled>Select an option</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}
        {error && helperText && (
          <p className="mt-1 text-xs text-red-500">{helperText}</p>
        )}
      </div>
    );
  }
);
