import React, { forwardRef, useState, useMemo } from "react";
import { useData } from "~/lib/use-data";

interface EntityReferenceFieldProps extends Omit<React.InputHTMLAttributes<HTMLSelectElement | HTMLInputElement>, 'size' | 'value'> {
  name: string;
  label: string;
  game: string;
  referenceApiEndpoint?: string;
  referenceValueKey?: string;
  referenceLabelKey?: string;
  multiple?: boolean;
  required?: boolean;
  currentValue?: string | string[];
  error?: boolean;
  helperText?: string;
  value?: string | string[];
}

export const EntityReferenceField = forwardRef<HTMLSelectElement | HTMLInputElement, EntityReferenceFieldProps>(
  ({ name, label, game, referenceApiEndpoint, referenceValueKey = "id", referenceLabelKey = "name", multiple = false, required = false, currentValue, error, helperText, ...props }, ref) => {
    const { data: entities, loading, error: fetchError } = useData(async () => {
      if (!referenceApiEndpoint) return [];
      
      const endpoint = referenceApiEndpoint.replace("{game}", game);
      const res = await fetch(endpoint);
      if (res.status === 401) {
        if (typeof window !== "undefined") window.location.href = "/login";
        throw new Error("Unauthorized: Session expired");
      }
      if (!res.ok) throw new Error("Failed to fetch reference data");
      const results = (await res.json()) as Record<string, unknown> | unknown[];
      
      // Handle if response is an array or an object containing an array
      let arr: unknown[] = [];
      if (Array.isArray(results)) {
        arr = results;
      } else if (results && typeof results === 'object') {
        if (Array.isArray(results.data)) {
          arr = results.data;
        } else if (Array.isArray(results.items)) {
          arr = results.items;
        } else if (Array.isArray(results.options)) {
          arr = results.options;
        }
      }
      
      return arr.map((r: unknown) => {
        const record = r as Record<string, unknown>;
        let labelValue = "";
        const labelKey = referenceLabelKey || "name";
        
        if (labelKey.includes("{")) {
          labelValue = labelKey.replace(/{([^}]+)}/g, (_, g) => String(record[g] || ""));
        } else {
          labelValue = String(record[labelKey] || record.name || record.id || "");
        }

        return {
          id: String(record[referenceValueKey || "id"] || record.id || ""),
          name: labelValue,
        };
      });
    }, [game, referenceApiEndpoint, referenceValueKey, referenceLabelKey], "EntityReferenceField-21");

    const options = (entities as {id: string, name: string}[]) || [];
    
    const [searchQuery, setSearchQuery] = useState("");
    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) return options;
      const q = searchQuery.toLowerCase();
      return options.filter(opt => opt.name.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q));
    }, [options, searchQuery]);

    const valArray = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);

    const handleCheckboxChange = (optId: string, isChecked: boolean, onChange?: (val: string[]) => void) => {
      let newValue: string[];
      if (isChecked) {
        newValue = [...valArray, optId];
      } else {
        newValue = valArray.filter((v) => v !== optId);
      }
      if (onChange) onChange(newValue);
    };
    
    if (loading) {
      return (
        <div>
          <label className={`block text-sm font-medium ${error ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
            {label} {required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800">
            Loading reference data...
          </div>
        </div>
      );
    }

    if (fetchError) {
      return (
        <div>
          <label className={`block text-sm font-medium text-red-500`}>
            {label}
          </label>
          <div className="mt-1 text-sm text-red-500">Failed to load reference data</div>
        </div>
      );
    }

    return (
      <div>
        <label className={`block text-sm font-medium ${error ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        
        {multiple ? (
          <div className="mt-2 space-y-2">
            {options.length > 5 && (
              <input
                type="search"
                placeholder={`Search ${options.length} options...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            )}
            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="text-sm text-gray-500 italic p-2">No options found.</div>
              ) : (
                filteredOptions.map((opt: { id: string; name: string }) => (
                  <label key={opt.id} className="flex items-center py-1">
                    <input
                      type="checkbox"
                      name={name}
                      value={opt.id}
                      checked={valArray.includes(opt.id)}
                      onChange={(e) => handleCheckboxChange(opt.id, e.target.checked, props.onChange as any)}
                      className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${error ? 'border-red-500' : ''}`}
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 truncate">{opt.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        ) : (
          <select
            name={name}
            required={required}
            className={`mt-1 block w-full rounded-md border ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'} bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 dark:bg-gray-800 dark:text-gray-100 ${error ? 'dark:border-red-500' : 'dark:border-gray-600'}`}
            ref={ref as React.LegacyRef<HTMLSelectElement>}
            {...(props as Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value'>)}
            value={(props.value || currentValue) as string || ""}
          >
            <option value="" disabled>Select option...</option>
            {options.map((opt: { id: string; name: string }) => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
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
