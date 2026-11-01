import {
  ArrowLeft,
  Box,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FileJson,
  Hash,
  List,
  ListOrdered,
  Plus,
  Settings2,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { createFile, getFile, listDirectory } from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { clearDataCache, useData } from "~/lib/use-data";
import { referenceEndpoints } from "~/lib/categories";
import { useCategories } from "~/lib/categories-context";
import {
  DynamicSchemaFileSchema,
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";

export default function DynamicSchemaNew() {
  const categories = useCategories();
  // Categories a new schema can have: the configured ones (older files may also say "event" or "cron_job").
  const isOfferedCategory = (category: unknown) => categories.some((c) => c.category === category);
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("hero");
  const [fields, setFields] = useState<DynamicField[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const buildExportPayload = () => ({
    name: name.trim() || "(untitled)",
    category,
    fields,
  });

  const handleExportCopy = async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(buildExportPayload(), null, 2),
    );
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleExportDownload = () => {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  const { data: loadedData } = useData(
    async () => {
      try {
        const [schemas, enums] = await Promise.all([
          listDirectory<DynamicSchemaFile>(game!, "schemas", true),
          listDirectory(game!, "enums"),
        ]);
        return { schemas, enums };
      } catch (e) {
        return { schemas: [], enums: [] as string[] };
      }
    },
    [game],
    "DynamicSchemaNew-49",
  );

  const [importSchemaId, setImportSchemaId] = useState("");

  const handleImportFields = () => {
    if (!importSchemaId || !loadedData?.schemas) return;
    const schemaToImport = loadedData.schemas.find(
      (s) => s.id === importSchemaId,
    );
    if (schemaToImport && schemaToImport.fields) {
      const clonedFields = JSON.parse(JSON.stringify(schemaToImport.fields));
      setFields((prev) => {
        const current = prev || [];
        const merged = [...current];
        clonedFields.forEach((newField: any) => {
          const existingIndex = merged.findIndex((f) => f.key === newField.key);
          if (existingIndex >= 0) {
            merged[existingIndex] = newField;
          } else {
            merged.push(newField);
          }
        });
        return merged;
      });
      toastSuccess(
        `Imported ${schemaToImport.fields.length} fields from ${schemaToImport.name}`,
      );
      setImportSchemaId("");
    }
  };

  const aiPromptMarkdown = useMemo(() => {
    const entityName =
      category === "hero"
        ? "Hero"
        : category === "map"
          ? "Map"
          : category === "mode"
            ? "Game Mode"
            : category === "patch"
              ? "Patch"
              : category === "news"
                ? "News Article"
                : category === "item"
                ? "Item"
                : "Entity";

    let categoryHint = "";
    if (category === "hero")
      categoryHint =
        "Think about roles, health, armor, movement speed, abilities, weapons, and passives.";
    else if (category === "map")
      categoryHint =
        "Think about map locations, supported game modes, release date, climate, and lore.";
    else if (category === "mode")
      categoryHint =
        "Think about win conditions, team sizes, time limits, and scoring mechanics.";
    else if (category === "patch")
      categoryHint =
        "Think about version string, release date, developer notes, and highlights.";
    else if (category === "news")
      categoryHint =
        "Think about headline, publish date, summary, cover image, and the link to the full article.";
    else if (category === "item")
      categoryHint =
        "Think about cost, tier, effects, stat bonuses, and descriptions.";

    const apiOptionsString = categories.map((c) => `"/api/{game}/${c.folder}"`).join(", ");

    return `# Athena Schema Generation Guidelines
You are an AI Architect. You are tasked with creating the structural blueprint (a JSON schema definition) for a **${entityName}** in the Athena platform.
DO NOT extract or generate data for a specific entity (e.g., do not give me Tracer's actual stats). Instead, generate the abstract structural fields that will be used as a template to define ANY ${entityName}.

## JSON Structure
\`\`\`json
{
  "name": "${name || `Base ${entityName} Attributes`}",
  "category": "${category}", // enum: ${categories.map((c) => `"${c.category}"`).join(", ")}
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
  }, [category, name]);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPromptMarkdown);
    toastSuccess("Copied to clipboard!");
  };

  const handleDownloadPrompt = () => {
    const blob = new Blob([aiPromptMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "athena_schema_ai_prompt.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.category && !isOfferedCategory(json.category)) {
          toastError(`"${json.category}" isn't a category the app shows: use one of ${categories.map((c) => c.category).join(", ")}.`);
          e.target.value = "";
          return;
        }
        if (json.name) setName(json.name);
        if (json.category) setCategory(json.category);
        if (json.fields && Array.isArray(json.fields)) {
          setFields((prev) => {
            const current = prev || [];
            const merged = [...current];
            json.fields.forEach((newField: any) => {
              const existingIndex = merged.findIndex(
                (f) => f.key === newField.key,
              );
              if (existingIndex >= 0) {
                merged[existingIndex] = newField;
              } else {
                merged.push(newField);
              }
            });
            return merged;
          });
          toastSuccess(`Imported schema fields from file!`);
        }
      } catch (err) {
        toastError("Invalid JSON file");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleImportPastedJson = () => {
    try {
      const json = JSON.parse(pastedJson);
      if (json.category && !isOfferedCategory(json.category)) {
        toastError(`"${json.category}" isn't a category the app shows: use one of ${categories.map((c) => c.category).join(", ")}.`);
        return;
      }
      if (json.name) setName(json.name);
      if (json.category) setCategory(json.category);
      if (json.fields && Array.isArray(json.fields)) {
        setFields((prev) => {
          const current = prev || [];
          const merged = [...current];
          json.fields.forEach((newField: any) => {
            const existingIndex = merged.findIndex(
              (f) => f.key === newField.key,
            );
            if (existingIndex >= 0) {
              merged[existingIndex] = newField;
            } else {
              merged.push(newField);
            }
          });
          return merged;
        });
        toastSuccess(`Imported schema fields from pasted text!`);
        setShowImportModal(false);
        setPastedJson("");
      } else {
        toastError("No 'fields' array found in JSON");
      }
    } catch (err) {
      toastError("Invalid JSON structure");
    }
  };

  const handleAddField = () => {
    setFields([
      ...fields,
      { key: "", label: "", type: "string", required: false },
    ]);
  };

  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleChangeField = (
    index: number,
    key: keyof DynamicField,
    value: string | boolean | string[] | undefined,
  ) => {
    setFields((prevFields) => {
      const newFields = [...prevFields];
      const field = { ...newFields[index] };

      if (key === "options") {
        field.options = value
          ? (value as string).split("\n").map((s) => s.trim())
          : undefined;
      } else if (key === "label") {
        const oldSlug = (field.label || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/(^_|_$)/g, "");
        const newSlug = ((value as string) || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/(^_|_$)/g, "");

        // Auto-generate if key is currently empty or matches exactly what the label used to slugify to
        const shouldUpdateKey = !field.key || field.key === oldSlug;

        field.label = value as string;
        if (shouldUpdateKey) {
          field.key = newSlug;
        }
      } else {
        (field as any)[key] = value;
      }

      newFields[index] = field;
      return newFields;
    });
  };

  const handleAddSubField = (parentIndex: number) => {
    const newFields = [...fields];
    if (!newFields[parentIndex].subFields) {
      newFields[parentIndex].subFields = [];
    }
    newFields[parentIndex].subFields!.push({
      key: `sub_field_${newFields[parentIndex].subFields!.length + 1}`,
      label: "New Sub-Field",
      type: "string",
      required: false,
    });
    setFields(newFields);
  };

  const handleRemoveSubField = (parentIndex: number, subIndex: number) => {
    const newFields = [...fields];
    newFields[parentIndex].subFields!.splice(subIndex, 1);
    setFields(newFields);
  };

  const handleChangeSubField = (
    fieldIndex: number,
    subFieldIndex: number,
    key: keyof DynamicField,
    value: string | boolean | string[] | undefined,
  ) => {
    setFields((prevFields) => {
      const newFields = [...prevFields];
      const subFields = [...(newFields[fieldIndex].subFields || [])];
      const subField = { ...subFields[subFieldIndex] };

      if (key === "options") {
        subField.options = value
          ? (value as string).split("\n").map((s) => s.trim())
          : undefined;
      } else if (key === "label") {
        const oldSlug = (subField.label || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/(^_|_$)/g, "");
        const newSlug = ((value as string) || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/(^_|_$)/g, "");
        const shouldUpdateKey = !subField.key || subField.key === oldSlug;
        subField.label = value as string;
        if (shouldUpdateKey) {
          subField.key = newSlug;
        }
      } else {
        (subField as any)[key] = value;
      }

      subFields[subFieldIndex] = subField;
      newFields[fieldIndex] = { ...newFields[fieldIndex], subFields };
      return newFields;
    });
  };

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setCommitError(null);

    if (!name.trim()) {
      setCommitError("Schema Name is required.");
      setSubmitting(false);
      return;
    }

    const generatedId = `${category}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}`;

    // Clean up options before saving
    const cleanedFields = fields.map((f) => {
      const newF = { ...f };
      if (newF.options) {
        newF.options = newF.options.map((o) => o.trim()).filter(Boolean);
      }
      if (newF.subFields) {
        newF.subFields = newF.subFields.map((sf) => {
          const newSf = { ...sf };
          if (newSf.options) {
            newSf.options = newSf.options.map((o) => o.trim()).filter(Boolean);
          }
          return newSf;
        });
      }
      return newF;
    });

    const newSchema = {
      id: generatedId,
      name: name.trim(),
      category: category,
      fields: cleanedFields,
    };

    const parsed = DynamicSchemaFileSchema.safeParse(newSchema);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      setCommitError(`Validation failed: ${errorMsg}`);
      toastError(`Validation failed: ${parsed.error.issues[0]?.message}`);
      setSubmitting(false);
      return;
    }

    try {
      const exists = await getFile(
        `data/${game}/schemas/${parsed.data.id}.json`,
      );
      if (exists) {
        setCommitError(`A schema with ID "${parsed.data.id}" already exists.`);
        toastError("A schema with this ID already exists.");
        setSubmitting(false);
        return;
      }

      await createFile(
        `data/${game}/schemas/${parsed.data.id}.json`,
        parsed.data,
        `Add schema: ${parsed.data.name}`,
      );
      toastSuccess(`Schema ${parsed.data.name} created successfully!`);
      clearDataCache();
      navigate(`/${game}/schemas`);
    } catch (err) {
      setCommitError((err as Error).message);
      toastError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full py-8 pb-32">
      <form onSubmit={handleCommit} className="space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate(`/${game}/schemas`)}
              className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Schemas
            </button>
            <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
              <Settings2 className="w-8 h-8 text-orange-500" />
              New Schema - <span className="capitalize">{game}</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/${game}/schemas`)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="shadow-lg px-8"
            >
              {submitting ? "Creating..." : "Create Schema"}
            </Button>
          </div>
        </div>

        {/* Schema Tools */}
        <div className="flex flex-wrap gap-2 items-center p-3 bg-surface-raised border border-border rounded-xl">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted uppercase tracking-wider pr-2 border-r border-border mr-1">
            <Sparkles className="w-3.5 h-3.5" /> AI
          </span>
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={() => setShowPromptModal(true)}
            className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
          >
            <Sparkles className="w-4 h-4 mr-1.5" /> Get AI Prompt
          </Button>
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={() => setShowImportModal(true)}
            className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
          >
            <Download className="w-4 h-4 mr-1.5" /> Import AI Schema
          </Button>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted uppercase tracking-wider px-2 border-l border-border ml-1">
            <FileJson className="w-3.5 h-3.5" /> Export
          </span>
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={handleExportCopy}
            className="text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
          >
            {exportCopied ? (
              <Check className="w-4 h-4 mr-1.5 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4 mr-1.5" />
            )}
            {exportCopied ? "Copied!" : "Copy JSON"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="small"
            onClick={handleExportDownload}
            className="text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
          >
            <Download className="w-4 h-4 mr-1.5" /> Download .json
          </Button>
          <Button
            type="button"
            variant="outline"
            size="small"
            disabled={fields.length < 2}
            onClick={() => setShowClearModal(true)}
            className="ml-auto text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Clear All Fields
          </Button>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        {/* Basic Settings Section */}
        <Card className="border-orange-500/20 shadow-sm">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-ink mb-2">
                  Schema Name
                </label>
                <input aria-label="Schema Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Base Hero Attributes"
                  className="block w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-ink mb-2">
                  Category
                </label>
                <select aria-label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="block w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                >
                  {categories.map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-xl font-bold text-ink tracking-tight">
                Fields Configuration
              </h2>
              <div className="flex gap-2">
                {loadedData?.schemas && loadedData.schemas.length > 0 && (
                  <div className="flex items-center gap-2 mr-4">
                    <select aria-label="Import fields from schema"
                      value={importSchemaId}
                      onChange={(e) => setImportSchemaId(e.target.value)}
                      className="block w-48 rounded-lg border-border-strong bg-surface px-3 py-1.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                    >
                      <option value="">Import Schema</option>
                      {loadedData.schemas
                        .filter((s) => s.category === category)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.fields?.length || 0} fields)
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      onClick={handleImportFields}
                      disabled={!importSchemaId}
                      size="small"
                      variant="outline"
                    >
                      Import
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleAddField}
                  size="small"
                  className="bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 dark:text-gray-900 shadow-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add New Field
                </Button>
              </div>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-16 text-ink-muted border-2 border-dashed border-border rounded-2xl bg-surface-raised">
                <div className="mx-auto w-16 h-16 bg-surface-raised rounded-full flex items-center justify-center mb-4">
                  <Settings2 className="w-8 h-8 text-ink-muted" />
                </div>
                <h3 className="text-lg font-medium text-ink mb-1">
                  No fields defined
                </h3>
                <p className="mb-6">
                  Start building your schema by adding the first field.
                </p>
                <Button
                  type="button"
                  onClick={handleAddField}
                  variant="outline"
                  className="flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" /> Add Field
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 bg-surface rounded-2xl border border-border shadow-sm relative group hover:border-blue-400/40 hover:shadow-[0_0_15px_rgba(74,158,255,0.15)] transition-colors"
                  >
                    {/* Left Column: Identifiers */}
                    <div className="lg:col-span-4 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                          Display Label
                        </label>
                        <input aria-label="Display Label"
                          value={field.label}
                          onChange={(e) =>
                            handleChangeField(index, "label", e.target.value)
                          }
                          placeholder="e.g. Max Health"
                          className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                          Field Key (Internal)
                        </label>
                        <input aria-label="Field Key (Internal)"
                          value={field.key}
                          onChange={(e) =>
                            handleChangeField(index, "key", e.target.value)
                          }
                          placeholder="e.g. max_health"
                          className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                        />
                      </div>
                    </div>

                    {/* Middle Column: Type & Unit */}
                    <div className="lg:col-span-3 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                          Data Type
                        </label>
                        <div className="relative">
                          {field.type === "string" && (
                            <Type className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "number" && (
                            <Hash className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "boolean" && (
                            <ToggleLeft className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "list" && (
                            <List className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "enum" && (
                            <ListOrdered className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "abilities" && (
                            <Box className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          {field.type === "weapon" && (
                            <Box className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          )}
                          <select aria-label="Field type"
                            value={field.type}
                            onChange={(e) =>
                              handleChangeField(index, "type", e.target.value)
                            }
                            className="block w-full rounded-lg border-border-strong bg-surface-raised pl-9 pr-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors appearance-none"
                          >
                            <option value="string">Text (String)</option>
                            <option value="number">Number</option>
                            <option value="boolean">Toggle (Boolean)</option>
                            <option value="list">
                              Multiple Select (Enum / List)
                            </option>
                            <option value="enum">Single Select (Enum)</option>
                            <option value="abilities">
                              Kit Abilities (Complex List)
                            </option>
                            <option value="weapon">
                              Weapons (Complex List)
                            </option>
                            <option value="object_array">
                              Object Group (Nested List)
                            </option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                          Unit / Suffix (Optional)
                        </label>
                        <input aria-label="Unit / Suffix (Optional)"
                          value={field.unit || ""}
                          onChange={(e) =>
                            handleChangeField(index, "unit", e.target.value)
                          }
                          placeholder="e.g. %, HP, m/s"
                          className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                        />
                      </div>
                    </div>

                    {/* Right Column: Config & Actions */}
                    <div className="lg:col-span-4 h-full flex flex-col">
                      {field.type === "enum" ||
                      field.type === "list" ||
                      field.type === "abilities" ||
                      field.type === "weapon" ? (
                        <div className="flex-1">
                          {(field.type === "enum" || field.type === "list") && (
                            <div className="mb-3">
                              <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                Global Enum Reference (Optional)
                              </label>
                              <select aria-label="Global Enum Reference (Optional)"
                                value={field.globalEnumId || ""}
                                onChange={(e) => {
                                  handleChangeField(
                                    index,
                                    "globalEnumId",
                                    e.target.value || undefined,
                                  );
                                  if (e.target.value)
                                    handleChangeField(
                                      index,
                                      "options",
                                      undefined,
                                    );
                                }}
                                className="block w-full rounded-lg border-border-strong bg-surface px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              >
                                <option value="">
                                  -- No Global Enum (Use Custom Options) --
                                </option>
                                {loadedData?.enums?.map((eId: string) => (
                                  <option key={eId} value={eId}>
                                    {eId}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {((field.type !== "enum" && field.type !== "list") ||
                            !field.globalEnumId) && (
                            <>
                              <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                {field.type === "abilities" ||
                                field.type === "weapon"
                                  ? `${field.type === "weapon" ? "Weapon" : "Ability"} Types (Optional, one per line)`
                                  : "Custom Options (One per line)"}
                              </label>
                              <textarea aria-label="Options (one per line)"
                                value={field.options?.join("\n") || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "options",
                                    e.target.value,
                                  )
                                }
                                placeholder={
                                  field.type === "abilities"
                                    ? "Ultimate\nPassive\nPrimary Fire"
                                    : field.type === "weapon"
                                      ? "Hitscan\nProjectile\nBeam"
                                      : "Tank\nDamage\nSupport"
                                }
                                rows={4}
                                className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white resize-none transition-colors"
                              />
                            </>
                          )}
                        </div>
                      ) : field.type === "reference" ||
                        field.type === "reference_list" ? (
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                              API Endpoint
                            </label>
                            <div className="flex gap-2">
                              <select aria-label="API Endpoint"
                                value={field.referenceApiEndpoint || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "referenceApiEndpoint",
                                    e.target.value,
                                  )
                                }
                                className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              >
                                <option value="" disabled>
                                  Select API Endpoint
                                </option>
                                {field.referenceApiEndpoint && !referenceEndpoints(categories).includes(field.referenceApiEndpoint) && (
                                  <option value={field.referenceApiEndpoint}>{field.referenceApiEndpoint} (not a category)</option>
                                )}
                                {categories.map(
                                  ({ category, folder }) => (
                                    <option
                                      key={category}
                                      value={`/api/{game}/${folder}`}
                                    >
                                      /api/{game}/
                                      {folder}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                Value Key
                              </label>
                              <input aria-label="Value Key"
                                list={`value-keys-${index}`}
                                value={field.referenceValueKey || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "referenceValueKey",
                                    e.target.value,
                                  )
                                }
                                placeholder="id"
                                className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                Label Template
                              </label>
                              <input aria-label="Label Template"
                                list={`label-keys-${index}`}
                                value={field.referenceLabelKey || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "referenceLabelKey",
                                    e.target.value,
                                  )
                                }
                                placeholder="name"
                                className="block w-full rounded-lg border-border-strong bg-surface-raised px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              />
                            </div>
                          </div>
                        </div>
                      ) : field.type === "object_array" ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-xl text-ink-muted text-xs text-center bg-surface-raised">
                          {(field.subFields || []).length} custom sub-fields
                          configured
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-xl text-ink-muted text-xs text-center bg-surface-raised">
                          No additional configuration needed for this data type.
                        </div>
                      )}
                    </div>

                    {/* Actions Column */}
                    <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-start h-full pt-2 lg:pt-0 mt-4 lg:mt-0 pl-0 lg:pl-4">
                      <div className="flex flex-row lg:flex-col items-center gap-3 p-2 bg-surface-raised rounded-xl border border-gray-200 dark:border-gray-800/60 shadow-sm mt-7">
                        <label
                          className="flex flex-col items-center gap-1.5 cursor-pointer group/req"
                          title="Required Field"
                        >
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              handleChangeField(
                                index,
                                "required",
                                e.target.checked,
                              )
                            }
                            className="w-4 h-4 rounded border-border-strong bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-ink-muted group-hover/req:text-gray-600 dark:group-hover/req:text-gray-300 uppercase transition-colors">
                            Req
                          </span>
                        </label>

                        <div className="w-px h-6 lg:w-6 lg:h-px bg-gray-200 dark:bg-gray-700/50" />

                        <button
                          type="button"
                          onClick={() => handleRemoveField(index)}
                          className="p-1.5 text-ink-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete field"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* BOTTOM ROW for ABILITIES or OBJECT ARRAY */}
                    {(field.type === "abilities" ||
                      field.type === "object_array") && (
                      <div className="col-span-1 lg:col-span-12 border-t border-border pt-6 mt-2">
                        <div className="flex flex-col p-5 border border-border rounded-xl bg-gray-50/50 dark:bg-gray-800/20 text-left">
                          {/* Abilities Standard Definition (Parent) */}
                          {field.type === "abilities" && (
                            <div className="mb-5">
                              <strong className="font-bold flex items-center gap-2 mb-2 text-ink text-sm">
                                <Box className="w-4 h-4 text-ink-muted" />{" "}
                                Complex Field Template
                              </strong>
                              <p className="mb-3 text-xs text-ink-muted">
                                Automatically embeds a managed Abilities list
                                containing standard properties:
                              </p>
                              <ul className="list-disc pl-5 space-y-1.5 text-xs">
                                <li>
                                  <span className="font-medium text-ink">
                                    Icon Upload
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Multi-image capabilities)
                                  </span>
                                </li>
                                <li>
                                  <span className="font-medium text-ink">
                                    ID
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Internal key generation)
                                  </span>
                                </li>
                                <li>
                                  <span className="font-medium text-ink">
                                    Name
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Display label)
                                  </span>
                                </li>
                                <li>
                                  <span className="font-medium text-ink">
                                    Type
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Classification)
                                  </span>
                                </li>
                                <li>
                                  <span className="font-medium text-ink">
                                    Description
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Optional markdown)
                                  </span>
                                </li>
                                <li>
                                  <span className="font-medium text-ink">
                                    Params
                                  </span>{" "}
                                  <span className="text-ink-muted">
                                    (Dynamic key-value parameters defined below)
                                  </span>
                                </li>
                              </ul>
                            </div>
                          )}

                          {/* Sub Fields Config (Nested Child) */}
                          <div
                            className={
                              field.type === "abilities"
                                ? "ml-0 md:ml-4 bg-surface-raised p-5 rounded-xl border border-border"
                                : "bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm"
                            }
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                              <div>
                                <span className="block font-bold text-sm text-ink">
                                  {field.type === "abilities"
                                    ? "Custom Params Sub-Fields"
                                    : "Nested Group Sub-Fields"}
                                </span>
                                <span className="text-xs text-ink-muted">
                                  {field.type === "abilities"
                                    ? "Configure explicit parameters appended to each ability (e.g., Cooldown, Damage)"
                                    : "Define the explicit fields that each object in this list will contain."}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddSubField(index)}
                                className="px-4 py-2 bg-surface-raised hover:bg-border text-ink border border-border-strong rounded-lg font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus text-sm"
                              >
                                <Plus className="w-4 h-4" /> Add Sub-Field
                              </button>
                            </div>

                            {(field.subFields || []).length > 0 ? (
                              <div className="space-y-3">
                                {field.subFields!.map((subField, sIndex) => (
                                  <div
                                    key={sIndex}
                                    className="flex flex-col gap-3 bg-surface-raised p-3 rounded-lg border border-border shadow-sm transition-colors hover:border-border-strong"
                                  >
                                    <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
                                      <input aria-label="Label"
                                        className="w-full sm:w-1/3 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
                                        placeholder="Label"
                                        value={subField.label}
                                        onChange={(e) =>
                                          handleChangeSubField(
                                            index,
                                            sIndex,
                                            "label",
                                            e.target.value,
                                          )
                                        }
                                      />
                                      <input aria-label="Key"
                                        className="w-full sm:w-1/3 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-blue-500 transition-colors"
                                        placeholder="key_internal"
                                        value={subField.key}
                                        onChange={(e) =>
                                          handleChangeSubField(
                                            index,
                                            sIndex,
                                            "key",
                                            e.target.value,
                                          )
                                        }
                                      />
                                      <select aria-label="Type"
                                        className="w-full sm:w-1/4 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
                                        value={subField.type}
                                        onChange={(e) =>
                                          handleChangeSubField(
                                            index,
                                            sIndex,
                                            "type",
                                            e.target.value,
                                          )
                                        }
                                      >
                                        <option value="string">String</option>
                                        <option value="number">Number</option>
                                        <option value="boolean">Boolean</option>
                                        <option value="enum">
                                          Enum (Single Select)
                                        </option>
                                        <option value="list">
                                          List (Multiple Select / Enum)
                                        </option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveSubField(index, sIndex)
                                        }
                                        className="text-ink-muted hover:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
                                        title="Remove sub-field"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {(subField.type === "enum" ||
                                      subField.type === "list") && (
                                      <div className="w-full mt-1 space-y-3">
                                        <div>
                                          <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                            Global Enum Reference (Optional)
                                          </label>
                                          <select aria-label="Global Enum Reference (Optional)"
                                            value={subField.globalEnumId || ""}
                                            onChange={(e) => {
                                              handleChangeSubField(
                                                index,
                                                sIndex,
                                                "globalEnumId",
                                                e.target.value || undefined,
                                              );
                                              if (e.target.value)
                                                handleChangeSubField(
                                                  index,
                                                  sIndex,
                                                  "options",
                                                  undefined,
                                                );
                                            }}
                                            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
                                          >
                                            <option value="">
                                              -- No Global Enum (Use Custom
                                              Options) --
                                            </option>
                                            {loadedData?.enums?.map(
                                              (eId: string) => (
                                                <option key={eId} value={eId}>
                                                  {eId}
                                                </option>
                                              ),
                                            )}
                                          </select>
                                        </div>
                                        {!subField.globalEnumId && (
                                          <div>
                                            <label className="block text-xs font-bold text-ink-muted mb-1.5 uppercase tracking-wider">
                                              Custom Options (One per line)
                                            </label>
                                            <textarea aria-label="Custom Options (One per line)"
                                              value={
                                                subField.options?.join("\n") ||
                                                ""
                                              }
                                              onChange={(e) =>
                                                handleChangeSubField(
                                                  index,
                                                  sIndex,
                                                  "options",
                                                  e.target.value,
                                                )
                                              }
                                              placeholder="Option 1\nOption 2\nOption 3"
                                              rows={3}
                                              className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors resize-y"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-8 text-center border-2 border-dashed border-border rounded-xl bg-gray-50/30 dark:bg-gray-800/10">
                                <p className="text-sm font-medium text-ink-muted opacity-80">
                                  No custom sub-fields defined.
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 opacity-70">
                                  Params will default to a generic JSON object.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {fields.length > 0 && (
              <div className="flex justify-between items-center pt-4">
                <Button
                  type="button"
                  onClick={handleAddField}
                  variant="outline"
                  className="border-dashed border-2 rounded-xl shadow-sm bg-surface px-12"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Another Field
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  disabled={submitting || fields?.length === 0}
                  
                >
                  {submitting ? "Saving..." : "Save Schema"}
                </Button>
              </div>
            )}
          </div>
      </form>

      {/* Clear All Fields Confirm Modal */}
      {showClearModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex justify-between items-center">
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-500" /> Clear All Fields
                </h3>
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  className="text-ink-muted hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-ink-muted">
                  This will remove all{" "}
                  <span className="font-semibold text-ink">
                    {fields.length} fields
                  </span>{" "}
                  from the schema. This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="small"
                    onClick={() => setShowClearModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    className="bg-red-600 hover:bg-red-700 border-0"
                    onClick={() => {
                      setFields([]);
                      setShowClearModal(false);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Clear All
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Prompt Modal */}
      {showPromptModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border flex justify-between items-center">
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt
                  Instructions
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-ink-muted mb-4">
                  Use the following prompt to instruct an AI (like ChatGPT or
                  Claude) to generate a schema for you. You can copy the text or
                  download it as a file.
                </p>
                <textarea aria-label="AI prompt"
                  readOnly
                  value={aiPromptMarkdown}
                  className="w-full h-64 rounded-lg border-border-strong bg-surface-raised p-4 text-xs font-mono text-ink focus:outline-none resize-none"
                />
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface-raised">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPromptModal(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadPrompt}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download .md
                </Button>
                <Button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-2"
                >
                  <ClipboardPaste className="w-4 h-4" /> Copy to Clipboard
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Import Modal */}
      {showImportModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border">
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" /> Import Schema
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                <div>
                  <label className="block text-sm font-bold text-ink mb-2">
                    Option 1: Upload JSON File
                  </label>
                  <div className="relative border-2 border-dashed border-border-strong rounded-xl p-8 text-center hover:bg-surface-raised transition-colors">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        handleFileUpload(e);
                        setShowImportModal(false);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-ink-muted mx-auto mb-2" />
                    <p className="text-sm text-ink-muted">
                      Click or drag and drop your generated JSON file here
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-xs font-medium text-ink-muted uppercase">
                    OR
                  </span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-ink mb-2">
                    Option 2: Paste JSON Directly
                  </label>
                  <textarea aria-label="Option 2: Paste JSON Directly"
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder="Paste your JSON schema here..."
                    rows={6}
                    className="w-full rounded-lg border-border-strong bg-surface-raised px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-surface-raised">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    handleImportPastedJson();
                  }}
                  disabled={!pastedJson.trim()}
                >
                  Import Pasted Schema
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
