import { ReferenceEndpointOptions } from "./ReferenceEndpointOptions";

import type { DynamicField } from "~/schemas/dynamic-schema";

const CONTROL_CLASS =
  "mt-1.5 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink focus:ring-1 focus:ring-blue-500 transition-colors";
const LABEL_CLASS = "block text-xs font-bold uppercase tracking-wider text-ink-muted";

interface SubFieldReferenceProps {
  subField: DynamicField;
  referenceOptions: string[];
  /** A cleared box leaves the setting out (undefined). */
  onChange: (setting: keyof DynamicField, value: string | undefined) => void;
}

/**
 * Where a reference sub-field reads its options: a category of the game, the
 * same as for top-level references (the record forms' pickers load them from there).
 */
export function SubFieldReference({ subField, referenceOptions, onChange }: SubFieldReferenceProps) {
  const endpoint = subField.referenceApiEndpoint ?? "";
  const set = (setting: keyof DynamicField) => (event: { target: { value: string } }) => {
    onChange(setting, event.target.value === "" ? undefined : event.target.value);
  };
  return (
    <div className="mt-1 grid w-full gap-3 sm:grid-cols-3">
      <label className={LABEL_CLASS}>
        API Endpoint
        <select value={endpoint} onChange={set("referenceApiEndpoint")} className={CONTROL_CLASS}>
          <ReferenceEndpointOptions endpoint={endpoint} referenceOptions={referenceOptions} />
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Value Key
        <input value={subField.referenceValueKey ?? ""} placeholder="id" onChange={set("referenceValueKey")} className={CONTROL_CLASS} />
      </label>
      <label className={LABEL_CLASS}>
        Label Template
        <input value={subField.referenceLabelKey ?? ""} placeholder="name" onChange={set("referenceLabelKey")} className={CONTROL_CLASS} />
      </label>
    </div>
  );
}
