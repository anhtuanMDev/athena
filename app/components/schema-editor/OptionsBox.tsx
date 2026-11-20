import { INPUT_CLASS, LABEL_CLASS, SUB_INPUT_CLASS } from "./constants";

import type { DynamicField } from "~/schemas/dynamic-schema";

/** What a field's options box asks for, by type; custom options otherwise. */
const LABELS: Partial<Record<DynamicField["type"], string>> = {
  abilities: "Ability Types (Optional, one per line)",
  weapon: "Weapon Types (Optional, one per line)",
};
const PLACEHOLDERS: Partial<Record<DynamicField["type"], string>> = {
  abilities: "Ultimate\nPassive\nPrimary Fire",
  weapon: "Hitscan\nProjectile\nBeam",
};

/** The box, as a top-level field's column shows it and as a sub-field's row does. */
const VARIANTS = {
  field: { ariaLabel: "Options (one per line)", placeholder: "Tank\nDamage\nSupport", rows: 4, className: `${INPUT_CLASS} resize-none` },
  sub: { ariaLabel: "Custom Options (One per line)", placeholder: "Option 1\nOption 2\nOption 3", rows: 3, className: `block w-full ${SUB_INPUT_CLASS} resize-y` },
} as const;

interface OptionsBoxProps {
  field: DynamicField;
  onOptions: (lines: string) => void;
  variant: keyof typeof VARIANTS;
}

/** A field's own options, one per line, kept as typed until the schema is saved. */
export function OptionsBox({ field, onOptions, variant }: OptionsBoxProps) {
  const look = VARIANTS[variant];
  return (
    <div>
      <label className={LABEL_CLASS}>{LABELS[field.type] ?? "Custom Options (One per line)"}</label>
      <textarea
        aria-label={look.ariaLabel}
        value={field.options?.join("\n") ?? ""}
        onChange={(event) => {
          onOptions(event.target.value);
        }}
        placeholder={PLACEHOLDERS[field.type] ?? look.placeholder}
        rows={look.rows}
        className={look.className}
      />
    </div>
  );
}
