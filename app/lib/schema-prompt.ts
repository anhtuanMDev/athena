// The prompt the schema editor's "Get AI Prompt" gives, asking an AI for a
// schema's fields (app/components/schema-editor): the same for a new schema
// and one being edited.

/** What the prompt calls a record of each built-in category; "Entity" for the others. */
const ENTITY_NAMES: Record<string, string> = {
  hero: "Hero",
  map: "Map",
  mode: "Game Mode",
  patch: "Patch",
  news: "News Article",
  item: "Item",
};

/** What the prompt suggests thinking about, by category; nothing for the others. */
const CATEGORY_HINTS: Record<string, string> = {
  hero: "Think about roles, health, armor, movement speed, abilities, weapons, and passives.",
  map: "Think about map locations, supported game modes, release date, climate, and lore.",
  mode: "Think about win conditions, team sizes, time limits, and scoring mechanics.",
  patch: "Think about version string, release date, developer notes, and highlights.",
  news: "Think about headline, publish date, summary, cover image, and the link to the full article.",
  item: "Think about cost, tier, effects, stat bonuses, and descriptions.",
};

/** The schema the prompt is for, and the choices it lists. */
export interface PromptSubject {
  /** The schema's category; "entity" when it has none. */
  category: string;
  /** The schema's name; the prompt suggests one when it's blank. */
  name: string;
  /** The configured categories, the values "category" may take. */
  categories: readonly { category: string }[];
  /** Where reference fields may read their options (categories.ts referenceEndpoints). */
  referenceOptions: readonly string[];
}

/** The markdown prompt for a schema's fields. */
export function schemaAiPrompt({ category, name, categories, referenceOptions }: PromptSubject): string {
  const entityName = ENTITY_NAMES[category] ?? "Entity";
  const categoryHint = CATEGORY_HINTS[category] ?? "";
  const apiOptionsString = referenceOptions.map((endpoint) => `"${endpoint}"`).join(", ");

  return `# Athena Schema Generation Guidelines
You are an AI Architect. You are tasked with creating the structural blueprint (a JSON schema definition) for a **${entityName}** in the Athena platform.
DO NOT extract or generate data for a specific entity (e.g., do not give me Tracer's actual stats). Instead, generate the abstract structural fields that will be used as a template to define ANY ${entityName}.

## JSON Structure
\`\`\`json
{
  "name": "${name || `Base ${entityName} Attributes`}",
  "category": "${category}", // enum: ${categories.map((entry) => `"${entry.category}"`).join(", ")}
  "fields": [
    {
      "key": "example_basic_field",
      "label": "Example Basic Field",
      "type": "number", // "string", "number", "boolean", "list", "enum", "abilities", "object_array", "reference", "reference_list", "weapon"
      "required": true,
      "unit": "HP" // optional, only include if relevant
    },
    {
      "key": "example_enum_field",
      "label": "Example Enum Field",
      "type": "enum",
      "required": true,
      "options": ["Option 1", "Option 2"] // required for list/enum
    }
  ]
}
\`\`\`

## Field Types
- \`string\`: Text input
- \`number\`: Numeric input
- \`boolean\`: Toggle switch
- \`list\`: Multiple select (requires \`options\` array of strings)
- \`enum\`: Single select (requires \`options\` array of strings)
- \`abilities\`: Complex ability structure. Takes \`subFields\` array for extra ability parameters. DO NOT include standard fields (\`id\`, \`name\`, \`type\`, \`description\`, \`icon\`, \`mode_overrides\`) in \`subFields\` as they are natively built-in. Only use \`subFields\` for custom parameters like damage, cooldown, etc.
- \`weapon\`: Complex weapon structure. Same behavior as \`abilities\` but semantically distinct. Takes \`subFields\` array for extra weapon parameters like ammo, reload time, spread, etc.
- \`object_array\`: Group of nested fields. Takes \`subFields\` array (each subField is a field object with key, label, type, etc.) for properties of the object.
- \`reference\`: API-based single select. Requires \`referenceApiEndpoint\` (MUST be one of: ${apiOptionsString}), \`referenceValueKey\` (e.g., "id"), \`referenceLabelKey\` (e.g., "name").
- \`reference_list\`: API-based multiple select. Requires \`referenceApiEndpoint\` (MUST be one of: ${apiOptionsString}), \`referenceValueKey\`, \`referenceLabelKey\`.

## Instructions
1. Generate the JSON structure EXACTLY as specified above.
2. Ensure \`key\` values are lowercase and alphanumeric with underscores.
3. Do not include extra root properties. Do NOT include empty \`options\` or \`subFields\` on field types that do not require them.
4. Generate a COMPREHENSIVE structural blueprint for a **${entityName}**. Do not just generate a single field. Include ALL relevant ${entityName}-specific fields and attributes that would be necessary to fully define ANY entity of this type in the game. Remember: You are defining the data model structure, not extracting data for a specific character/map/item.
5. ${categoryHint} Do not include hero-specific concepts (like passives or weapons) unless this is a Hero schema.
`;
}
