import { useFormContext } from "react-hook-form";

/** Every value the check refused, by key, above the buttons. */
export function HeroErrorList() {
  const { formState: { errors } } = useFormContext<Record<string, unknown>>();
  const entries = Object.entries(errors);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
      <h4 className="text-sm font-bold text-red-800 dark:text-red-400 mb-2">Please fix the following validation errors:</h4>
      <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
        {entries.map(([key, error]) => (
          <li key={key}>
            <span className="font-semibold">{key}:</span> {typeof error?.message === "string" && error.message !== "" ? error.message : "Invalid value"}
          </li>
        ))}
      </ul>
    </div>
  );
}
