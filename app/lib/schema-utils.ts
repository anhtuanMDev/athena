import { type DynamicField } from "~/schemas/dynamic-schema";
import { type GlobalEnum } from "~/schemas/enum";

export function generateAiPromptMarkdown({
  entityName,
  schemaName,
  category,
  categoryHint,
  fields,
  enums,
}: {
  entityName: string;
  schemaName: string;
  category: string;
  categoryHint: string;
  fields: DynamicField[];
  enums: GlobalEnum[];
}) {
  return `I have provided a source (like a wiki page) about a ${entityName.toLowerCase()}. Extract the data and output a **single JSON object** matching the schema below.

> **Note:** Do NOT include \`id\` or \`game\` — these are injected automatically by the system.

### Field Schema
\`\`\`json
${JSON.stringify(
  [
    { key: "name", type: "string", required: true },
    ...fields.map((f) => {
      if (f.key === "name" || f.key === "id" || f.key === "game") return null;
      let options = f.options;
      if (f.globalEnumId) {
        const globalEnum = enums.find((e) => e.id === f.globalEnumId);
        if (globalEnum) {
          options = globalEnum.options.map((o) => o.id);
        }
      }
      let subFields = f.subFields;
      if (subFields) {
        subFields = subFields.map((sf) => {
          let sfOptions = sf.options;
          if (sf.globalEnumId) {
            const sfGlobalEnum = enums.find((e) => e.id === sf.globalEnumId);
            if (sfGlobalEnum) {
              sfOptions = sfGlobalEnum.options.map((o) => o.id);
            }
          }
          return { ...sf, options: sfOptions };
        });
      }

      return {
        key: f.key,
        type: f.type,
        required: f.required,
        options: options,
        subFields: subFields,
      };
    }).filter(Boolean),
  ],
  null,
  2,
)}
\`\`\`

${
  fields.some((f) => f.type === "abilities" || f.type === "weapon")
    ? `### Rules for \`abilities\` / \`weapon\` arrays
Each item in these arrays **must** follow this exact shape. \`name\` and \`type\` are **required non-empty strings**:
\`\`\`json
{
  "name": "Ability Name",
  "type": "ability_type",
  "description": "Optional description",
  "params": {}
}
\`\`\``
    : ""
}

Use \`""\`, \`0\`, \`false\`, or \`[]\` for optional fields not found in the source. Return ONLY the JSON object with no extra commentary.`;
}

export function formatImportedJson(
  json: Record<string, unknown>,
  fields: DynamicField[],
  game: string,
  generateId: boolean = true
): Record<string, unknown> {
  const formattedJson: Record<string, unknown> = { ...json };

  if (!formattedJson.game) formattedJson.game = game;
  
  if (generateId && !formattedJson.id) {
    const entityName = formattedJson.name;
    if (entityName && typeof entityName === "string") {
      formattedJson.id = entityName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }
  }

  const sanitizeValue = (val: any, fieldDef: DynamicField) => {
    if (fieldDef.type === "list" || fieldDef.type === "reference_list") {
      if (val === "" || val === null || val === undefined || val === false || val === 0) {
        return [];
      }
      if (!Array.isArray(val)) {
        return [String(val)];
      }
      return val.map(String);
    }
    if (fieldDef.type === "abilities" || fieldDef.type === "weapon" || fieldDef.type === "object_array") {
      if (val === "" || val === null || val === undefined || val === false || val === 0) {
        return [];
      }
      if (!Array.isArray(val)) {
        return [val];
      }
    }
    return val;
  };

  fields.forEach((f) => {
    if (formattedJson[f.key] !== undefined) {
      formattedJson[f.key] = sanitizeValue(formattedJson[f.key], f);
    }

    if (f.type === "object_array" && Array.isArray(formattedJson[f.key]) && f.subFields) {
      (formattedJson[f.key] as any[]).forEach((item) => {
        if (item && typeof item === "object") {
          f.subFields!.forEach((sf) => {
            if (item[sf.key] !== undefined) {
              item[sf.key] = sanitizeValue(item[sf.key], sf);
            }
          });
        }
      });
    }

    if (
      (f.type === "abilities" || f.type === "weapon") &&
      Array.isArray(formattedJson[f.key])
    ) {
      formattedJson[f.key] = (formattedJson[f.key] as unknown[]).map(
        (item) => {
          if (typeof item !== "object" || item === null) return item;
          const raw = item as Record<string, unknown>;
          const standardKeys = [
            "id",
            "name",
            "type",
            "description",
            "icon",
            "mode_overrides",
          ];
          const formattedItem: Record<string, unknown> = {
            params: {} as Record<string, unknown>,
          };

          Object.keys(raw).forEach((k) => {
            if (standardKeys.includes(k)) {
              formattedItem[k] = raw[k];
            } else if (k === "params" && typeof raw[k] === "object" && raw[k] !== null) {
              Object.assign(formattedItem.params as Record<string, unknown>, raw[k]);
            } else {
              (formattedItem.params as Record<string, unknown>)[k] = raw[k];
            }
          });

          if (!formattedItem.id) {
            if (
              formattedItem.name &&
              typeof formattedItem.name === "string"
            ) {
              formattedItem.id = formattedItem.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            } else {
              formattedItem.id = Math.random().toString(36).substring(7);
            }
          }

          if (
            !formattedItem.params ||
            typeof formattedItem.params !== "object"
          ) {
            formattedItem.params = {};
          }

          if (f.subFields) {
            const paramsObj = formattedItem.params as Record<string, unknown>;
            f.subFields.forEach((sf) => {
              if (paramsObj[sf.key] !== undefined) {
                paramsObj[sf.key] = sanitizeValue(paramsObj[sf.key], sf);
              }
            });
          }

          return formattedItem;
        },
      );
    }
  });
  return formattedJson;
}
