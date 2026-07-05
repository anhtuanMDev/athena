import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { DynamicSchemaFileSchema, type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus, Trash2 } from "lucide-react";

export default function DynamicSchemaEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  assertSafeGameSlug(game!);

  const { data: loaderData, loading, error: loadError } = useData(async () => {
    if (!id) throw new Error("Schema ID missing");
    const file = await getFile<DynamicSchemaFile>(`data/${game}/schemas/${id}.json`);
    if (!file) throw new Error("Schema not found");
    return { schema: file.content, sha: file.sha };
  }, [game, id]);

  const [apiEndpoint, setApiEndpoint] = useState<string>("");
  const [fields, setFields] = useState<DynamicField[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Initialize fields once loaded
  if (loaderData && fields === null) {
    setFields(loaderData.schema.fields || []);
    setApiEndpoint(loaderData.schema.api_endpoint || "");
  }

  const handleAddField = () => {
    setFields([...(fields || []), { key: "", label: "", type: "string", required: false }]);
  };

  const handleRemoveField = (index: number) => {
    if (!fields) return;
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  const handleChangeField = (index: number, key: keyof DynamicField, value: any) => {
    if (!fields) return;
    const newFields = [...fields];
    
    if (key === 'options') {
      // Split comma separated options
      newFields[index] = { ...newFields[index], [key]: value.split(',').map((s: string) => s.trim()).filter(Boolean) };
    } else {
      newFields[index] = { ...newFields[index], [key]: value };
    }
    setFields(newFields);
  };

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!loaderData || !fields) return;
    setSubmitting(true);
    setCommitError(null);

    const updatedSchema = {
      ...loaderData.schema,
      api_endpoint: apiEndpoint || undefined,
      fields,
    };

    const parsed = DynamicSchemaFileSchema.safeParse(updatedSchema);
    if (!parsed.success) {
      setCommitError("Validation failed. Please ensure all keys are lowercase alphanumeric with underscores.");
      setSubmitting(false);
      return;
    }

    try {
      await updateFile(`data/${game}/schemas/${id}.json`, parsed.data, loaderData.sha, `Update schema: ${id}`);
      navigate(`/${game}/schemas`);
    } catch (err) {
      if (isConflictError(err)) {
        setCommitError("Conflict: file was modified since loading. Refresh and re-apply.");
      } else {
        setCommitError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (loadError) return <div>Error: {(loadError as Error).message}</div>;
  if (!loaderData || !fields) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Schema: {loaderData.schema.name}</h1>
          <p className="text-sm text-gray-500 mt-1">ID: {loaderData.schema.id} | Category: <span className="capitalize">{loaderData.schema.category}</span></p>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/${game}/schemas`)}>Back to List</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fields Configuration</h2>
            <Button onClick={handleAddField} size="small" variant="outline" className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {commitError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 mb-6">{commitError}</div>}
          
          <form onSubmit={handleCommit} className="space-y-8">
            <div className="bg-gray-50/50 dark:bg-gray-900/30 p-4 rounded-lg border border-gray-200/50 dark:border-gray-800/50">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data Source API Endpoint (Optional)
              </label>
              <input 
                value={apiEndpoint} 
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://api.example.com/latest-patch" 
                className="block w-full rounded border-gray-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              />
              <p className="text-xs text-gray-500 mt-2">
                If configured, the automated background Cron worker will fetch data from this URL and process it based on this schema's rules.
              </p>
            </div>

            <div className="space-y-4">
              {fields.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                  No fields defined yet. Add a field to get started.
                </div>
              ) : (
                fields.map((field, index) => (
                  <div key={index} className="flex gap-4 items-start p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 relative">
                    <button 
                      type="button" 
                      onClick={() => handleRemoveField(index)}
                      className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-8">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Key (Internal)</label>
                          <input 
                            value={field.key} 
                            onChange={(e) => handleChangeField(index, 'key', e.target.value)}
                            placeholder="e.g. role, max_health" 
                            className="block w-full rounded border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Label (Display)</label>
                          <input 
                            value={field.label} 
                            onChange={(e) => handleChangeField(index, 'label', e.target.value)}
                            placeholder="e.g. Hero Role" 
                            className="block w-full rounded border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Data Type</label>
                          <select 
                            value={field.type} 
                            onChange={(e) => handleChangeField(index, 'type', e.target.value)}
                            className="block w-full rounded border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="list">List (Multiple Select)</option>
                            <option value="enum">Enum (Single Select)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-8">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit (Optional)</label>
                          <input 
                            value={field.unit || ""} 
                            onChange={(e) => handleChangeField(index, 'unit', e.target.value)}
                            placeholder="e.g. %, HP, seconds" 
                            className="block w-full rounded border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                          />
                        </div>
                        
                        {(field.type === "enum" || field.type === "list") && (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Predefined Options (Comma-separated)</label>
                            <input 
                              value={field.options?.join(", ") || ""} 
                              onChange={(e) => handleChangeField(index, 'options', e.target.value)}
                              placeholder="e.g. Tank, Damage, Support" 
                              className="block w-full rounded border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                            <p className="text-[10px] text-gray-500 mt-1">These will appear as dropdown selections in the form.</p>
                          </div>
                        )}
                        
                        <div className="flex items-center mt-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={field.required} 
                              onChange={(e) => handleChangeField(index, 'required', e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-blue-600" 
                            />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Required Field</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-6 border-t border-gray-200 dark:border-gray-800">
              <Button type="submit" disabled={submitting || fields.length === 0}>
                {submitting ? "Saving..." : "Save Schema"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
