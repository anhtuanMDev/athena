import {
  ArrowLeft,
  Box,
  Hash,
  List,
  ListOrdered,
  Plus,
  Settings2,
  ToggleLeft,
  Trash2,
  Type,
  Upload,
  Download,
  Sparkles,
  ClipboardPaste,
  AlertTriangle,
  FileJson,
  Copy,
  Check,
  LayoutTemplate,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  getFile,
  isConflictError,
  updateFile,
  listDirectory,
} from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { clearDataCache, useData } from "~/lib/use-data";
import {
  DynamicSchemaFileSchema,
  SchemaCategorySchema,
  getCategoryDirectory,
  type DynamicField,
  type DynamicSchemaFile,
} from "~/schemas/dynamic-schema";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

export default function DynamicSchemaEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  const { success: toastSuccess, error: toastError } = useToast();

  const {
    data: loaderData,
    loading,
    error: loadError,
  } = useData(
    async () => {
      if (!id) throw new Error("Schema ID missing");
      const [file, schemas, enums] = await Promise.all([
        getFile<DynamicSchemaFile>(`data/${game}/schemas/${id}.json`),
        listDirectory<DynamicSchemaFile>(game!, "schemas", true).catch(
          () => [],
        ),
        listDirectory(game!, "enums").catch(() => []),
      ]);
      if (!file) throw new Error("Schema not found");
      return {
        schema: file.content,
        sha: file.sha,
        allSchemas: schemas,
        enums,
      };
    },
    [game, id],
    `${game}-schema-${id}`,
  );

  const [fields, setFields] = useState<DynamicField[] | null>(null);
  const [cronConfig, setCronConfig] = useState({
    apiResponseDefinition: "",
    apiPayloadDefinition: "",
    dataHandling: "",
    finalResultDestination: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const handleExportCopy = async () => {
    if (!loaderData) return;
    await navigator.clipboard.writeText(
      JSON.stringify(loaderData.schema, null, 2),
    );
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const handleExportDownload = () => {
    if (!loaderData) return;
    const schema = loaderData.schema;
    const blob = new Blob([JSON.stringify(schema, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedJson, setPastedJson] = useState("");

  const [importSchemaId, setImportSchemaId] = useState("");

  const handleImportFields = () => {
    if (!importSchemaId || !loaderData?.allSchemas) return;
    const schemaToImport = loaderData.allSchemas.find(
      (s) => s.id === importSchemaId,
    );
    if (schemaToImport && schemaToImport.fields) {
      const clonedFields = JSON.parse(JSON.stringify(schemaToImport.fields));
      setFields((prev) => [...(prev || []), ...clonedFields]);
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
  "category": "hero", // enum: "hero", "map", "mode", "patch", "event", "item", "cron_job"
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
- \`list\`: Multiple select (requires \`options\` array of strings)
- \`enum\`: Single select (requires \`options\` array of strings)
- \`abilities\`: Complex ability structure. Takes \`subFields\` array for extra ability parameters. DO NOT include standard fields (\`id\`, \`name\`, \`type\`, \`description\`, \`icon\`, \`mode_overrides\`) in \`subFields\` as they are natively built-in. Only use \`subFields\` for custom parameters like damage, cooldown, etc.
- \`weapon\`: Complex weapon structure. Same behavior as \`abilities\` but semantically distinct. Takes \`subFields\` array for extra weapon parameters like ammo, reload time, spread, etc.
- \`object_array\`: Group of nested fields. Takes \`subFields\` array (each subField is a field object with key, label, type, etc.) for properties of the object.
- \`reference\`: API-based single select (requires \`referenceApiEndpoint\`, \`referenceValueKey\`, \`referenceLabelKey\`)
- \`reference_list\`: API-based multiple select (requires \`referenceApiEndpoint\`, \`referenceValueKey\`, \`referenceLabelKey\`)

## Instructions
1. Generate the JSON structure EXACTLY as specified above.
2. Ensure \`key\` values are lowercase and alphanumeric with underscores.
3. Do not include extra root properties.
4. Generate a COMPREHENSIVE schema. Do not just generate a single field (like abilities). Include ALL relevant game-specific fields, stats, passives, weapons, and attributes that would be necessary to fully define this game entity.
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

  const [fieldApiKeys, setFieldApiKeys] = useState<Record<number, string[]>>(
    {},
  );
  const [loadingApiKeys, setLoadingApiKeys] = useState<Record<number, boolean>>(
    {},
  );

  const fetchApiKeys = async (index: number, endpoint: string) => {
    if (!endpoint) return;
    setLoadingApiKeys((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch(endpoint.replace("{game}", game!));
      if (res.status === 401) {
        if (typeof window !== "undefined") window.location.href = "/login";
        throw new Error("Unauthorized: Session expired");
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as Record<string, unknown> | unknown[];
      let arr: unknown[] = [];
      if (Array.isArray(json)) {
        arr = json;
      } else if (json && typeof json === "object") {
        const jsonObj = json as Record<string, unknown>;
        if (Array.isArray(jsonObj.data)) {
          arr = jsonObj.data;
        } else if (Array.isArray(jsonObj.items)) {
          arr = jsonObj.items;
        }
      }
      if (arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null) {
        const firstItem = arr[0] as Record<string, unknown>;
        setFieldApiKeys((prev) => ({
          ...prev,
          [index]: Object.keys(firstItem),
        }));
        toastSuccess(`Loaded ${Object.keys(firstItem).length} fields from API`);
      } else {
        toastError("API returned empty list or non-objects");
      }
    } catch (err) {
      toastError("Failed to fetch API endpoint");
      console.error(err);
    } finally {
      setLoadingApiKeys((prev) => ({ ...prev, [index]: false }));
    }
  };

  useEffect(() => {
    if (loaderData && fields === null) {
      setFields(loaderData.schema.fields || []);
      if (loaderData.schema.cronConfig) {
        setCronConfig({
          apiResponseDefinition:
            loaderData.schema.cronConfig.apiResponseDefinition || "",
          apiPayloadDefinition:
            loaderData.schema.cronConfig.apiPayloadDefinition || "",
          dataHandling: loaderData.schema.cronConfig.dataHandling || "",
          finalResultDestination:
            loaderData.schema.cronConfig.finalResultDestination || "",
        });
      }
    }
  }, [loaderData, fields]);

  const handleAddField = () => {
    setFields([
      ...(fields || []),
      { key: "", label: "", type: "string", required: false },
    ]);
  };

  const handleRemoveField = (index: number) => {
    if (!fields) return;
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
      if (!prevFields) return prevFields;
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
    if (!fields) return;
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
    if (!fields) return;
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
      if (!prevFields) return prevFields;
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
    if (!loaderData || !fields) return;
    setSubmitting(true);
    setCommitError(null);

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

    const updatedSchema = {
      ...loaderData.schema,
      fields: loaderData.schema.category === "cron_job" ? [] : cleanedFields,
      ...(loaderData.schema.category === "cron_job" ? { cronConfig } : {}),
    };

    const parsed = DynamicSchemaFileSchema.safeParse(updatedSchema);
    if (!parsed.success) {
      setCommitError(
        "Validation failed. Please ensure all keys are lowercase alphanumeric with underscores.",
      );
      toastError("Validation failed. Check your fields.");
      setSubmitting(false);
      return;
    }

    try {
      await updateFile(
        `data/${game}/schemas/${id}.json`,
        parsed.data,
        loaderData.sha,
        `Update schema: ${id}`,
      );
      toastSuccess(`Schema ${loaderData.schema.name} updated successfully!`);
      clearDataCache();
      navigate(`/${game}/schemas`);
    } catch (err) {
      if (isConflictError(err)) {
        setCommitError((err as Error).message);
        toastError((err as Error).message);
        setSubmitting(false);
        return;
      } else {
        setCommitError((err as Error).message);
        toastError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
      </div>
    );
  }

  if (loadError) {
    const isNotFound = String(loadError).includes("not found");
    if (isNotFound) {
      return (
        <div className="w-full py-12">
          <EmptyState
            title="Schema Not Found"
            description="The schema you are trying to edit could not be found or has been deleted."
            action={
              <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <LoadErrorState
        title="Failed to Load Schema"
        error={loadError}
        onBack={() => navigate(`/admin/games/${game}/schemas`)}
      />
    );
  }

  if (!loaderData || !fields) return null;

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
              Edit Schema: {loaderData.schema.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-500 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                ID: {loaderData.schema.id}
              </span>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded capitalize">
                {loaderData.schema.category}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/${game}/layouts/${id}`)}
              className="border-blue-500 text-blue-600 hover:bg-blue-50 w-full sm:w-auto"
            >
              <LayoutTemplate className="w-4 h-4 mr-2" />
              Edit App Layout
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(`/${game}/schemas/${id}/delete`)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Schema
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/${game}/schemas`)}
              className="w-full sm:w-auto"
            >
              Discard Changes
            </Button>
            <Button
              type="submit"
              disabled={submitting || fields.length === 0}
              className="shadow-lg shadow-orange-500/20 px-8 w-full sm:w-auto"
            >
              {submitting ? "Saving..." : "Save Schema"}
            </Button>
          </div>
        </div>

        {/* Schema Tools */}
        <div className="flex flex-wrap gap-2 items-center p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-xl justify-between">
          <div className="flex items-center justify-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider pr-2 border-r border-gray-200 dark:border-gray-700 mr-1">
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
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 border-l border-gray-200 dark:border-gray-700 ml-1">
              <FileJson className="w-3.5 h-3.5" /> Export
            </span>
            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={handleExportCopy}
              disabled={!loaderData}
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
              disabled={!loaderData}
              className="text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/50"
            >
              <Download className="w-4 h-4 mr-1.5" /> Download .json
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="small"
            disabled={!fields || fields.length < 2}
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

        {/* Conditionally Render Fields or Cron Config */}
        {loaderData.schema.category === "cron_job" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Cron Job Configuration
              </h2>
            </div>
            <Card className="border-orange-500/20 shadow-sm">
              <CardContent className="p-6 md:p-8 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                    API Response Definition
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Define how the API responds (e.g. JSON structure, expected
                    fields).
                  </p>
                  <textarea
                    value={cronConfig.apiResponseDefinition}
                    onChange={(e) =>
                      setCronConfig({
                        ...cronConfig,
                        apiResponseDefinition: e.target.value,
                      })
                    }
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                    API Params / Payload
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Define parameters or payload (enum, current/custom time,
                    required params, or call another API with params).
                  </p>
                  <textarea
                    value={cronConfig.apiPayloadDefinition}
                    onChange={(e) =>
                      setCronConfig({
                        ...cronConfig,
                        apiPayloadDefinition: e.target.value,
                      })
                    }
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Data Handling
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    How we handle the API response (convert, add, extract,
                    filter, mapping).
                  </p>
                  <textarea
                    value={cronConfig.dataHandling}
                    onChange={(e) =>
                      setCronConfig({
                        ...cronConfig,
                        dataHandling: e.target.value,
                      })
                    }
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Final Result Destination
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Select other schema to know the structure to insert new data
                    or calling another cron job.
                  </p>
                  <textarea
                    value={cronConfig.finalResultDestination}
                    onChange={(e) =>
                      setCronConfig({
                        ...cronConfig,
                        finalResultDestination: e.target.value,
                      })
                    }
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Fields Configuration
              </h2>
              <div className="flex gap-2">
                {loaderData?.allSchemas && loaderData.allSchemas.length > 0 && (
                  <div className="flex items-center gap-2 mr-4">
                    <select
                      value={importSchemaId}
                      onChange={(e) => setImportSchemaId(e.target.value)}
                      className="block w-48 rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                    >
                      <option value="">Import Schema</option>
                      {loaderData.allSchemas
                        .filter(
                          (s) =>
                            s.category === loaderData.schema.category &&
                            s.id !== loaderData.schema.id,
                        )
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
                          {field.type === "weapon" && (
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
                            <option value="enum">Single Select (Enum)</option>
                            <option value="list">
                              Multiple Select (Enum / List)
                            </option>
                            <option value="abilities">
                              Kit Abilities (Complex List)
                            </option>
                            <option value="weapon">
                              Weapons (Complex List)
                            </option>
                            <option value="object_array">
                              Object Group (Nested List)
                            </option>
                            <option value="reference">
                              Entity Reference (Single)
                            </option>
                            <option value="reference_list">
                              Entity Reference (Multiple)
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
                      field.type === "abilities" ||
                      field.type === "weapon" ? (
                        <div className="flex-1">
                          {(field.type === "enum" || field.type === "list") && (
                            <div className="mb-3">
                              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                Global Enum Reference (Optional)
                              </label>
                              <select
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
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              >
                                <option value="">
                                  -- No Global Enum (Use Custom Options) --
                                </option>
                                {loaderData?.enums?.map((eId: string) => (
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
                              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                {field.type === "abilities" ||
                                field.type === "weapon"
                                  ? `${field.type === "weapon" ? "Weapon" : "Ability"} Types (Optional, one per line)`
                                  : "Custom Options (One per line)"}
                              </label>
                              <textarea
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
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white resize-none transition-colors"
                              />
                            </>
                          )}
                        </div>
                      ) : field.type === "reference" ||
                        field.type === "reference_list" ? (
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                              API Endpoint
                            </label>
                            <div className="flex gap-2">
                              <input
                                list={`api-options-${index}`}
                                value={field.referenceApiEndpoint || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "referenceApiEndpoint",
                                    e.target.value,
                                  )
                                }
                                placeholder="/api/{game}/heroes"
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  fetchApiKeys(
                                    index,
                                    field.referenceApiEndpoint || "",
                                  )
                                }
                                disabled={
                                  loadingApiKeys[index] ||
                                  !field.referenceApiEndpoint
                                }
                              >
                                {loadingApiKeys[index] ? "..." : "Fetch Fields"}
                              </Button>
                            </div>
                            <datalist id={`api-options-${index}`}>
                              {SchemaCategorySchema.options.map((category) => (
                                <option
                                  key={category}
                                  value={`/api/{game}/${getCategoryDirectory(category)}`}
                                />
                              ))}
                            </datalist>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                Value Key
                              </label>
                              <input
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
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              />
                              {fieldApiKeys[index] && (
                                <datalist id={`value-keys-${index}`}>
                                  {fieldApiKeys[index].map((k) => (
                                    <option key={k} value={k} />
                                  ))}
                                </datalist>
                              )}
                            </div>
                            <div className="flex-1">
                              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                Label Template
                              </label>
                              <input
                                list={`label-keys-${index}`}
                                value={field.referenceLabelKey || ""}
                                onChange={(e) =>
                                  handleChangeField(
                                    index,
                                    "referenceLabelKey",
                                    e.target.value,
                                  )
                                }
                                placeholder="{name} - {id}"
                                className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                              />
                              {fieldApiKeys[index] && (
                                <datalist id={`label-keys-${index}`}>
                                  {fieldApiKeys[index].map((k) => (
                                    <option key={k} value={`{${k}}`} />
                                  ))}
                                </datalist>
                              )}
                            </div>
                          </div>
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
                                <Box className="w-4 h-4 text-gray-400" />{" "}
                                Complex Field Template
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
                                    className="flex flex-col gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                                  >
                                    <div className="flex flex-col sm:flex-row gap-3 items-center w-full">
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
                                        className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
                                        title="Remove sub-field"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {(subField.type === "enum" ||
                                      subField.type === "list") && (
                                      <div className="w-full mt-1 space-y-3">
                                        <div>
                                          <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                            Global Enum Reference (Optional)
                                          </label>
                                          <select
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
                                            className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
                                          >
                                            <option value="">
                                              -- No Global Enum (Use Custom
                                              Options) --
                                            </option>
                                            {loaderData?.enums?.map(
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
                                            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                                              Custom Options (One per line)
                                            </label>
                                            <textarea
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
                                              className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors resize-y"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
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
              <div className="flex justify-between items-center pt-4">
                <Button
                  type="button"
                  onClick={handleAddField}
                  variant="outline"
                  className="border-dashed border-2 rounded-xl shadow-sm bg-white dark:bg-gray-900 px-12"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Another Field
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  disabled={submitting || fields?.length === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {submitting ? "Saving..." : "Save Schema"}
                </Button>
              </div>
            )}
          </div>
        )}
      </form>

      {/* Clear All Fields Confirm Modal */}
      {showClearModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-500" /> Clear All Fields
                </h3>
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This will remove all{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {fields?.length} fields
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
                    className="bg-red-600 hover:bg-red-700 text-white border-0"
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
