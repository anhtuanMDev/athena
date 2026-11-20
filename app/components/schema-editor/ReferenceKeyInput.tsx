import { INPUT_CLASS, LABEL_CLASS } from "./constants";

interface ReferenceKeyInputProps {
  label: string;
  value: string | undefined;
  placeholder: string;
  listId: string;
  /** The keys "Fetch Fields" found, offered as the input's list. */
  options: string[] | undefined;
  onChange: (value: string) => void;
}

/** One of a reference field's keys, offering the keys "Fetch Fields" found. */
export function ReferenceKeyInput({ label, value, placeholder, listId, options, onChange }: ReferenceKeyInputProps) {
  return (
    <div className="flex-1">
      <label className={LABEL_CLASS}>{label}</label>
      <input
        aria-label={label}
        list={listId}
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {options && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
}
