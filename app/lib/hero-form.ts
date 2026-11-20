import type { DynamicField } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

// What the hero editor (app/components/hero-editor) works out without React:
// the prompt for the AI, and the ability mode overrides a save refuses. An AI
// import is record-form.ts's importedRecord, as the mode editor's is.

/** The hero's fields as the AI prompt lists them: each enum field with its enum's option ids. */
function promptFields(fields: DynamicField[], enums: GlobalEnum[]) {
  const optionsOf = (field: DynamicField) => enums.find((entry) => entry.id === field.globalEnumId)?.options.map((option) => option.id) ?? field.options;
  return [
    { key: "name", type: "string", required: true },
    { key: "real_name", type: "string", required: false },
    ...fields.map((field) => ({
      key: field.key,
      type: field.type,
      required: field.required,
      options: optionsOf(field),
      subFields: field.subFields?.map((sub) => ({ ...sub, options: optionsOf(sub) })),
    })),
  ];
}

/** "Get AI Prompt": what an AI needs to turn a source about a hero into the hero's JSON. */
export function heroAiPrompt(fields: DynamicField[], enums: GlobalEnum[]): string {
  return `I have provided a source (like a wiki page) about a hero. Extract the hero's data and output a **single JSON object** matching the schema below.

> **Note:** Do NOT include \`id\` or \`game\` — these are injected automatically by the system.

> **IMPORTANT INSTRUCTIONS:**
> 1. The output MUST be a pure JSON object containing the actual extracted data.
> 2. The keys of your JSON object MUST match the "key" values from the Field Definitions below.
> 3. DO NOT output a JSON schema. DO NOT include "category" or "fields" properties.

### Field Definitions
\`\`\`json
${JSON.stringify(promptFields(fields, enums), null, 2)}
\`\`\`

### Rules for \`abilities\` / \`weapon\` arrays
Each item in these arrays **must** follow this exact shape. \`name\` and \`type\` are **required non-empty strings**:
\`\`\`json
{
  "name": "Ability Name",
  "type": "ability_type",
  "description": "Optional description",
  "params": {}
}
\`\`\`

The \`params\` object should contain the specific sub-fields mapped for that field (if any). If a sub-field is type \`boolean\`, use \`true\`/\`false\`. If it's a \`number\`, use a real JSON number.

Use \`""\`, \`0\`, \`false\`, or \`[]\` for optional fields not found in the source. Return ONLY the JSON object with no extra commentary.`;
}

/** The first mode an ability overrides that isn't one of `modes`, if any. */
function unknownMode(ability: Record<string, unknown>, modes: ReadonlySet<string>): string | undefined {
  const overrides = ability.mode_overrides;
  return overrides && typeof overrides === "object" ? Object.keys(overrides).find((mode) => !modes.has(mode)) : undefined;
}

/** Why a save is refused for an ability's override of a mode the game doesn't have, or null. */
export function modeOverrideProblem(fields: DynamicField[], record: Record<string, unknown>, modes: ReadonlySet<string>): string | null {
  const abilities = fields
    .filter((entry) => entry.type === "abilities")
    .flatMap((entry) => (Array.isArray(record[entry.key]) ? (record[entry.key] as Record<string, unknown>[]) : []));
  for (const ability of abilities) {
    const unknown = unknownMode(ability, modes);
    if (unknown !== undefined) {
      const label = typeof ability.name === "string" && ability.name !== "" ? ability.name : ability.id;
      return `Ability '${String(label)}' references invalid mode override: '${unknown}'`;
    }
  }
  return null;
}
