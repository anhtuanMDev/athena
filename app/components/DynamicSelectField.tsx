
interface DynamicSelectFieldProps {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string | string[];
  multiple?: boolean;
  required?: boolean;
  currentValue?: any;
}

export function DynamicSelectField({ name, label, options, defaultValue, multiple = false, required = false, currentValue }: DynamicSelectFieldProps) {
  // Check if current value exists but is not in options
  const valArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
  const hasInvalidOldData = valArray.some(v => v && !options.includes(v));
  
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                defaultChecked={valArray.includes(opt)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{opt}</span>
            </label>
          ))}
        </div>
      ) : (
        <select
          name={name}
          defaultValue={Array.isArray(defaultValue) ? defaultValue[0] : (defaultValue || "")}
          required={required}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="" disabled>Select an option</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
    </div>
  );
}
