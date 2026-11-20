import { Button } from "~/components/ui/button";

import { INPUT_CLASS, LABEL_CLASS } from "./constants";
import { ReferenceEndpointOptions } from "./ReferenceEndpointOptions";
import { ReferenceKeyInput } from "./ReferenceKeyInput";

import type { FieldChoices } from "./types";
import type { DynamicField } from "~/schemas/dynamic-schema";

interface ReferencePanelProps {
  field: DynamicField;
  index: number;
  choices: FieldChoices;
  onChange: (setting: keyof DynamicField, value: string) => void;
}

/**
 * Where a top-level reference field reads its records (a category of the
 * game), and which of their keys it stores and shows. "Fetch Fields" offers
 * the keys of the first record found.
 */
export function ReferencePanel({ field, index, choices, onChange }: ReferencePanelProps) {
  const endpoint = field.referenceApiEndpoint ?? "";
  const found = choices.apiKeys.keys[index];
  const isLoading = choices.apiKeys.loading[index] === true;
  return (
    <div className="flex-1 space-y-3">
      <div>
        <label className={LABEL_CLASS}>API Endpoint</label>
        <div className="flex gap-2">
          <select aria-label="API Endpoint" value={endpoint} onChange={(event) => { onChange("referenceApiEndpoint", event.target.value); }} className={INPUT_CLASS}>
            <ReferenceEndpointOptions endpoint={endpoint} referenceOptions={choices.referenceOptions} />
          </select>
          <Button type="button" variant="outline" onClick={() => void choices.apiKeys.fetchKeys(index, endpoint)} disabled={isLoading || endpoint === ""}>
            {isLoading ? "..." : "Fetch Fields"}
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <ReferenceKeyInput label="Value Key" value={field.referenceValueKey} placeholder="id" listId={`value-keys-${String(index)}`} options={found} onChange={(value) => { onChange("referenceValueKey", value); }} />
        <ReferenceKeyInput label="Label Template" value={field.referenceLabelKey} placeholder="{name} - {id}" listId={`label-keys-${String(index)}`} options={found?.map((key) => `{${key}}`)} onChange={(value) => { onChange("referenceLabelKey", value); }} />
      </div>
    </div>
  );
}
