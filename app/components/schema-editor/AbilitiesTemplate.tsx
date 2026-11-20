import { Box } from "lucide-react";

/** What every ability has without a sub-field for it. */
const STANDARD_PROPERTIES = [
  ["Icon Upload", "(Multi-image capabilities)"],
  ["ID", "(Internal key generation)"],
  ["Name", "(Display label)"],
  ["Type", "(Classification)"],
  ["Description", "(Optional markdown)"],
  ["Params", "(Dynamic key-value parameters defined below)"],
] as const;

/** An abilities field's built-in properties, above the sub-fields that add its params. */
export function AbilitiesTemplate() {
  return (
    <div className="mb-5">
      <strong className="font-bold flex items-center gap-2 mb-2 text-ink text-sm">
        <Box className="w-4 h-4 text-ink-muted" /> Complex Field Template
      </strong>
      <p className="mb-3 text-xs text-ink-muted">Automatically embeds a managed Abilities list containing standard properties:</p>
      <ul className="list-disc pl-5 space-y-1.5 text-xs">
        {STANDARD_PROPERTIES.map(([name, note]) => (
          <li key={name}>
            <span className="font-medium text-ink">{name}</span> <span className="text-ink-muted">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
