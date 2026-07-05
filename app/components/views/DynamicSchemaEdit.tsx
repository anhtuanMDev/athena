import { useNavigate, useParams } from "react-router";
import { useState } from "react";
import { DynamicSchemaFileSchema, type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData } from "~/lib/use-data";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus, Trash2, ArrowLeft, Settings2, GripVertical } from "lucide-react";
import { useToast } from "~/components/ToastProvider";

export default function DynamicSchemaEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  assertSafeGameSlug(game!);
  const { success: toastSuccess, error: toastError } = useToast();

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
      toastError("Validation failed. Check your fields.");
      setSubmitting(false);
      return;
    }

    try {
      await updateFile(`data/${game}/schemas/${id}.json`, parsed.data, loaderData.sha, `Update schema: ${id}`);
      toastSuccess(`Schema ${loaderData.schema.name} updated successfully!`);
      navigate(`/${game}/schemas`);
    } catch (err) {
      if (isConflictError(err)) {
        setCommitError("Conflict: file was modified since loading. Refresh and re-apply.");
        toastError("Conflict detected! Someone else modified this file.");
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
    return (
      <div className="w-full py-8 text-center">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-xl border border-red-200 dark:border-red-800/50 inline-block">
          <h3 className="font-bold text-lg mb-2">Error Loading Schema</h3>
          <p>{(loadError as Error).message}</p>
        </div>
      </div>
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

          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/schemas`)}>
              Discard Changes
            </Button>
            <Button type="submit" disabled={submitting || fields.length === 0} className="shadow-lg shadow-orange-500/20 px-8">
              {submitting ? "Saving..." : "Save Schema"}
            </Button>
          </div>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

        {/* API Endpoint Section */}
        <Card className="border-orange-500/20 shadow-sm">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
              <div className="flex-1">
                <label className="block text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Data Source API Endpoint <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input 
                  value={apiEndpoint} 
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="https://api.example.com/latest-patch" 
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3 text-sm shadow-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                />
              </div>
              <p className="text-xs text-gray-500 md:max-w-xs md:mt-6 leading-relaxed">
                If configured, the automated background <strong className="text-gray-700 dark:text-gray-300">Cron worker</strong> will fetch data from this URL and process it based on this schema's structure.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Fields List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Fields Configuration</h2>
            <Button type="button" onClick={handleAddField} size="small" className="bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-200 dark:text-gray-900 shadow-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add New Field
            </Button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20">
              <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Settings2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No fields defined</h3>
              <p className="mb-6">Start building your schema by adding the first field.</p>
              <Button type="button" onClick={handleAddField} variant="outline" className="flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Add Field
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={index} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative group hover:border-orange-500/50 transition-all">
                  
                  {/* Left Column: Identifiers */}
                  <div className="lg:col-span-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Field Key (Internal)</label>
                      <input 
                        value={field.key} 
                        onChange={(e) => handleChangeField(index, 'key', e.target.value)}
                        placeholder="e.g. max_health" 
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Display Label</label>
                      <input 
                        value={field.label} 
                        onChange={(e) => handleChangeField(index, 'label', e.target.value)}
                        placeholder="e.g. Max Health" 
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                      />
                    </div>
                  </div>

                  {/* Middle Column: Type & Unit */}
                  <div className="lg:col-span-3 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Data Type</label>
                      <select 
                        value={field.type} 
                        onChange={(e) => handleChangeField(index, 'type', e.target.value)}
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors"
                      >
                        <option value="string">Text (String)</option>
                        <option value="number">Number</option>
                        <option value="boolean">Toggle (Boolean)</option>
                        <option value="list">Multiple Select (List)</option>
                        <option value="enum">Single Select (Enum)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Unit / Suffix (Optional)</label>
                      <input 
                        value={field.unit || ""} 
                        onChange={(e) => handleChangeField(index, 'unit', e.target.value)}
                        placeholder="e.g. %, HP, m/s" 
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                      />
                    </div>
                  </div>

                  {/* Right Column: Config & Actions */}
                  <div className="lg:col-span-4 h-full flex flex-col">
                    {(field.type === "enum" || field.type === "list") ? (
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Options (Comma-separated)</label>
                        <textarea 
                          value={field.options?.join(", ") || ""} 
                          onChange={(e) => handleChangeField(index, 'options', e.target.value)}
                          placeholder="Tank, Damage, Support"
                          rows={4}
                          className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white resize-none transition-colors" 
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-gray-400 dark:text-gray-500 text-xs text-center bg-gray-50/50 dark:bg-gray-900/30">
                        No additional configuration needed for this data type.
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="lg:col-span-1 flex flex-row lg:flex-col items-center justify-between h-full pt-2 lg:pt-0 border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800/50 mt-4 lg:mt-0 pl-0 lg:pl-4">
                    <label className="flex flex-col items-center gap-1.5 cursor-pointer group/req">
                      <input 
                        type="checkbox" 
                        checked={field.required} 
                        onChange={(e) => handleChangeField(index, 'required', e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-orange-600 focus:ring-orange-500 cursor-pointer" 
                      />
                      <span className="text-[10px] font-bold text-gray-400 group-hover/req:text-gray-600 dark:group-hover/req:text-gray-300 uppercase transition-colors">Req</span>
                    </label>
                    
                    <button 
                      type="button" 
                      onClick={() => handleRemoveField(index)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                      title="Remove Field"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}

          {fields.length > 0 && (
            <div className="flex justify-center pt-4">
              <Button type="button" onClick={handleAddField} variant="outline" className="border-dashed border-2 rounded-xl shadow-sm bg-white dark:bg-gray-900 px-12">
                <Plus className="w-4 h-4 mr-2" /> Add Another Field
              </Button>
            </div>
          )}
        </div>
        
      </form>
    </div>
  );
}
