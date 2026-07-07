import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router";
import {
  DynamicSchemaFileSchema,
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";
import { getFile, createFile, listDirectory } from "~/lib/github";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { clearDataCache, useData } from "~/lib/use-data";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Settings2,
  Box,
  Type,
  Hash,
  ToggleLeft,
  List,
  ListOrdered,
  Upload,
  Download,
  Sparkles,
  ClipboardPaste,
} from "lucide-react";
import { useToast } from "~/components/ToastProvider";

export default function DynamicSchemaNew() {
  const { game } = useParams();
  assertSafeGameSlug(game!);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("hero");
  const [fields, setFields] = useState<DynamicField[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  const { data: existingSchemas } = useData(async () => {
    try {
      return await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    } catch (e) {
      return [];
    }
  }, [game]);

  const [importSchemaId, setImportSchemaId] = useState("");

  const handleImportFields = () => {
    if (!importSchemaId || !existingSchemas) return;
    const schemaToImport = existingSchemas.find((s) => s.id === importSchemaId);
    if (schemaToImport && schemaToImport.fields) {
      const clonedFields = JSON.parse(JSON.stringify(schemaToImport.fields));
      setFields((prev) => [...prev, ...clonedFields]);
      toastSuccess(
        `Imported ${schemaToImport.fields.length} fields from ${schemaToImport.name}`,
      );
      setImportSchemaId("");
    }
  };

  const aiPromptMarkdown = `# Athena Schema Generation Guidelines
You are tasked with generating a JSON schema for a game entity in the Athena platform.

## JSON Structure
\`\`\`json
{
  "name": "Base Hero Attributes",
  "category": "hero", // enum: "hero", "map", "mode", "patch", "event", "item"
  "fields": [
    {
      "key": "health",
      "label": "Base Health",
      "type": "number", // "string", "number", "boolean", "list", "enum", "abilities", "object_array", "reference", "reference_list"
      "required": true,
      "unit": "HP", // optional
      "options": [], // array of strings for list/enum
      "subFields": [] // optional array of sub-fields for abilities/object_array
    }
  ]
}
\`\`\`

## Field Types
- \`string\`: Text input
- \`number\`: Numeric input
- \`boolean\`: Toggle switch
- \`list\`: Multiple select (requires \`options\`)
- \`enum\`: Single select (requires \`options\`)
- \`abilities\`: Complex ability structure (takes \`subFields\` for extra params)
- \`object_array\`: Group of nested fields (requires \`subFields\`)
- \`reference\`: API-based single select (requires \`referenceApiEndpoint\`, \`referenceValueKey\`, \`referenceLabelKey\`)
- \`reference_list\`: API-based multiple select (requires \`referenceApiEndpoint\`, \`referenceValueKey\`, \`referenceLabelKey\`)

## Instructions
1. Generate the JSON structure EXACTLY as specified above.
2. Ensure \`key\` values are lowercase and alphanumeric with underscores.
3. Do not include extra root properties.
`;

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
        if (json.name) setName(json.name);
        if (json.category) setCategory(json.category);
        if (json.fields && Array.isArray(json.fields)) {
          setFields((prev) => [...(prev || []), ...json.fields]);
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
      if (json.name) setName(json.name);
      if (json.category) setCategory(json.category);
      if (json.fields && Array.isArray(json.fields)) {
        setFields((prev) => [...(prev || []), ...json.fields]);
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
    value: any,
  ) => {
    const newFields = [...fields];
    const field = newFields[index];

    if (key === "options") {
      newFields[index] = { ...field, [key]: value.split("\n") };
    } else if (key === "label") {
      const oldSlug = (field.label || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/(^_|_$)/g, "");
      const newSlug = (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/(^_|_$)/g, "");

      // Auto-generate if key is currently empty or matches exactly what the label used to slugify to
      const shouldUpdateKey = !field.key || field.key === oldSlug;

      newFields[index] = { ...field, label: value };
      if (shouldUpdateKey) {
        newFields[index].key = newSlug;
      }
    } else {
      newFields[index] = { ...field, [key]: value };
    }
    setFields(newFields);
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
    parentIndex: number,
    subIndex: number,
    key: keyof DynamicField,
    value: any,
  ) => {
    const newFields = [...fields];
    const subField = newFields[parentIndex].subFields![subIndex];

    if (key === "options") {
      newFields[parentIndex].subFields![subIndex] = {
        ...subField,
        [key]: value.split("\n"),
      };
    } else if (key === "label") {
      const oldSlug = (subField.label || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/(^_|_$)/g, "");
      const newSlug = (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/(^_|_$)/g, "");
      const shouldUpdateKey = !subField.key || subField.key === oldSlug;
      newFields[parentIndex].subFields![subIndex] = {
        ...subField,
        label: value,
      };
      if (shouldUpdateKey) {
        newFields[parentIndex].subFields![subIndex].key = newSlug;
      }
    } else {
      newFields[parentIndex].subFields![subIndex] = {
        ...subField,
        [key]: value,
      };
    }
    setFields(newFields);
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
      setCommitError(
        "Validation failed. Please ensure all keys are lowercase alphanumeric with underscores.",
      );
      toastError("Validation failed. Check your fields.");
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
              className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Schemas
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
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
              className="shadow-lg shadow-orange-500/20 px-8"
            >
              {submitting ? "Creating..." : "Create Schema"}
            </Button>
          </div>
        </div>

        {/* AI & File Actions */}
        <div className="flex flex-wrap gap-3 items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl mb-6">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 text-sm font-medium">
            <Sparkles className="w-5 h-5 text-blue-500" />
            AI Schema Generation
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={() => setShowPromptModal(true)}
              className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Get AI Prompt
            </Button>
            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={() => setShowImportModal(true)}
              className="text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-800/50"
            >
              <Download className="w-4 h-4 mr-2" />
              Import AI Schema
            </Button>
          </div>
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
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Schema Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Base Hero Attributes"
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                >
                  <option value="hero">Hero</option>
                  <option value="map">Map</option>
                  <option value="mode">Mode</option>
                  <option value="patch">Patch</option>
                  <option value="event">Event</option>
                  <option value="item">Item</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fields List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Fields Configuration
            </h2>
            <div className="flex gap-2">
              {existingSchemas && existingSchemas.length > 0 && (
                <div className="flex items-center gap-2 mr-4">
                  <select
                    value={importSchemaId}
                    onChange={(e) => setImportSchemaId(e.target.value)}
                    className="block w-48 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  >
                    <option value="">-- Import from Schema --</option>
                    {existingSchemas.map((s) => (
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
                className="bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-200 dark:text-gray-900 shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add New Field
              </Button>
            </div>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20">
              <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Settings2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
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
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative group hover:border-blue-400/40 hover:shadow-[0_0_15px_rgba(74,158,255,0.15)] transition-all"
                >
                  {/* Left Column: Identifiers */}
                  <div className="lg:col-span-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                        Display Label
                      </label>
                      <input
                        value={field.label}
                        onChange={(e) =>
                          handleChangeField(index, "label", e.target.value)
                        }
                        placeholder="e.g. Max Health"
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                        Field Key (Internal)
                      </label>
                      <input
                        value={field.key}
                        onChange={(e) =>
                          handleChangeField(index, "key", e.target.value)
                        }
                        placeholder="e.g. max_health"
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                      />
                    </div>
                  </div>

                  {/* Middle Column: Type & Unit */}
                  <div className="lg:col-span-3 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                        Data Type
                      </label>
                      <div className="relative">
                        {field.type === "string" && (
                          <Type className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        {field.type === "number" && (
                          <Hash className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        {field.type === "boolean" && (
                          <ToggleLeft className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        {field.type === "list" && (
                          <List className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        {field.type === "enum" && (
                          <ListOrdered className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        {field.type === "abilities" && (
                          <Box className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        )}
                        <select
                          value={field.type}
                          onChange={(e) =>
                            handleChangeField(index, "type", e.target.value)
                          }
                          className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pl-9 pr-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors appearance-none"
                        >
                          <option value="string">Text (String)</option>
                          <option value="number">Number</option>
                          <option value="boolean">Toggle (Boolean)</option>
                          <option value="list">Multiple Select (List)</option>
                          <option value="enum">Single Select (Enum)</option>
                          <option value="abilities">
                            Kit Abilities (Complex List)
                          </option>
                          <option value="object_array">
                            Object Group (Nested List)
                          </option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                        Unit / Suffix (Optional)
                      </label>
                      <input
                        value={field.unit || ""}
                        onChange={(e) =>
                          handleChangeField(index, "unit", e.target.value)
                        }
                        placeholder="e.g. %, HP, m/s"
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                      />
                    </div>
                  </div>

                  {/* Right Column: Config & Actions */}
                  <div className="lg:col-span-4 h-full flex flex-col">
                    {field.type === "enum" ||
                    field.type === "list" ||
                    field.type === "abilities" ? (
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          {field.type === "abilities"
                            ? "Ability Types (Optional, one per line)"
                            : "Options (One per line)"}
                        </label>
                        <textarea
                          value={field.options?.join("\n") || ""}
                          onChange={(e) =>
                            handleChangeField(index, "options", e.target.value)
                          }
                          placeholder={
                            field.type === "abilities"
                              ? "Ultimate\nPassive\nPrimary Fire"
                              : "Tank\nDamage\nSupport"
                          }
                          rows={4}
                          className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white resize-none transition-colors"
                        />
                      </div>
                    ) : field.type === "object_array" ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 dark:text-gray-400 text-xs text-center bg-gray-50/50 dark:bg-gray-900/30">
                        {(field.subFields || []).length} custom sub-fields
                        configured
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-gray-400 dark:text-gray-500 text-xs text-center bg-gray-50/50 dark:bg-gray-900/30">
                        No additional configuration needed for this data type.
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-start h-full pt-2 lg:pt-0 mt-4 lg:mt-0 pl-0 lg:pl-4">
                    <div className="flex flex-row lg:flex-col items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-800/60 shadow-sm mt-7">
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
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-[9px] font-bold text-gray-400 group-hover/req:text-gray-600 dark:group-hover/req:text-gray-300 uppercase transition-colors">
                          Req
                        </span>
                      </label>

                      <div className="w-px h-6 lg:w-6 lg:h-px bg-gray-200 dark:bg-gray-700/50" />

                      <button
                        type="button"
                        onClick={() => handleRemoveField(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        title="Delete field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* BOTTOM ROW for ABILITIES or OBJECT ARRAY */}
                  {(field.type === "abilities" ||
                    field.type === "object_array") && (
                    <div className="col-span-1 lg:col-span-12 border-t border-gray-200 dark:border-gray-800 pt-6 mt-2">
                      <div className="flex flex-col p-5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 text-left">
                        {/* Abilities Standard Definition (Parent) */}
                        {field.type === "abilities" && (
                          <div className="mb-5">
                            <strong className="font-bold flex items-center gap-2 mb-2 text-gray-900 dark:text-gray-100 text-sm">
                              <Box className="w-4 h-4 text-gray-400" /> Complex
                              Field Template
                            </strong>
                            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                              Automatically embeds a managed Abilities list
                              containing standard properties:
                            </p>
                            <ul className="list-disc pl-5 space-y-1.5 text-xs">
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  Icon Upload
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
                                  (Multi-image capabilities)
                                </span>
                              </li>
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  ID
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
                                  (Internal key generation)
                                </span>
                              </li>
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  Name
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
                                  (Display label)
                                </span>
                              </li>
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  Type
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
                                  (Classification)
                                </span>
                              </li>
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  Description
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
                                  (Optional markdown)
                                </span>
                              </li>
                              <li>
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  Params
                                </span>{" "}
                                <span className="text-gray-400 dark:text-gray-500">
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
                              ? "ml-0 md:ml-4 bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm border-l-2 border-l-blue-500/50"
                              : "bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm"
                          }
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                            <div>
                              <span className="block font-bold text-sm text-gray-900 dark:text-gray-100">
                                {field.type === "abilities"
                                  ? "Custom Params Sub-Fields"
                                  : "Nested Group Sub-Fields"}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {field.type === "abilities"
                                  ? "Configure explicit parameters appended to each ability (e.g., Cooldown, Damage)"
                                  : "Define the explicit fields that each object in this list will contain."}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddSubField(index)}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-full font-medium flex items-center gap-1.5 transition-colors text-sm whitespace-nowrap shadow-sm"
                            >
                              <Plus className="w-4 h-4" /> Add Sub-Field
                            </button>
                          </div>

                          {(field.subFields || []).length > 0 ? (
                            <div className="space-y-3">
                              {field.subFields!.map((subField, sIndex) => (
                                <div
                                  key={sIndex}
                                  className="flex flex-col sm:flex-row gap-3 items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                                >
                                  <input
                                    className="w-full sm:w-1/3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
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
                                  <input
                                    className="w-full sm:w-1/3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-blue-500 transition-colors"
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
                                  <select
                                    className="w-full sm:w-1/4 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
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
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveSubField(index, sIndex)
                                    }
                                    className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
                                    title="Remove sub-field"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/30 dark:bg-gray-800/10">
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-500 opacity-80">
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
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                onClick={handleAddField}
                variant="outline"
                className="border-dashed border-2 rounded-xl shadow-sm bg-white dark:bg-gray-900 px-12"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Another Field
              </Button>
            </div>
          )}
        </div>
      </form>

      {/* Prompt Modal */}
      {showPromptModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" /> AI Prompt
                  Instructions
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <p className="text-sm text-gray-500 mb-4">
                  Use the following prompt to instruct an AI (like ChatGPT or
                  Claude) to generate a schema for you. You can copy the text or
                  download it as a file.
                </p>
                <textarea
                  readOnly
                  value={aiPromptMarkdown}
                  className="w-full h-64 rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-xs font-mono text-gray-700 dark:text-gray-300 focus:outline-none resize-none"
                />
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-500" /> Import Schema
                </h3>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Option 1: Upload JSON File
                  </label>
                  <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        handleFileUpload(e);
                        setShowImportModal(false);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Click or drag and drop your generated JSON file here
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    OR
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    Option 2: Paste JSON Directly
                  </label>
                  <textarea
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder="Paste your JSON schema here..."
                    rows={6}
                    className="w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-gray-200 transition-colors"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white"
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
