import { useNavigate, useParams } from "react-router";
import { useState, useEffect } from "react";
import { DynamicSchemaFileSchema, type DynamicSchemaFile, type DynamicField } from "~/schemas/dynamic-schema";
import { getFile, updateFile, isConflictError } from "~/lib/github";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useData, clearDataCache } from "~/lib/use-data";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { Plus, Trash2, ArrowLeft, Settings2, GripVertical, Box, Type, Hash, ToggleLeft, List, ListOrdered } from "lucide-react";
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

  const [fields, setFields] = useState<DynamicField[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData && fields === null) {
      setFields(loaderData.schema.fields || []);
    }
  }, [loaderData, fields]);

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
    const field = newFields[index];
    
    if (key === 'options') {
      newFields[index] = { ...field, [key]: value.split('\n') };
    } else if (key === 'label') {
      const oldSlug = (field.label || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
      const newSlug = (value || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
      
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

  const handleChangeSubField = (parentIndex: number, subIndex: number, key: keyof DynamicField, value: any) => {
    if (!fields) return;
    const newFields = [...fields];
    const subField = newFields[parentIndex].subFields![subIndex];
    
    if (key === 'options') {
      newFields[parentIndex].subFields![subIndex] = { ...subField, [key]: value.split('\n') };
    } else if (key === 'label') {
      const oldSlug = (subField.label || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
      const newSlug = (value || "").toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
      const shouldUpdateKey = !subField.key || subField.key === oldSlug;
      newFields[parentIndex].subFields![subIndex] = { ...subField, label: value };
      if (shouldUpdateKey) {
        newFields[parentIndex].subFields![subIndex].key = newSlug;
      }
    } else {
      newFields[parentIndex].subFields![subIndex] = { ...subField, [key]: value };
    }
    setFields(newFields);
  };

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!loaderData || !fields) return;
    setSubmitting(true);
    setCommitError(null);

    // Clean up options before saving
    const cleanedFields = fields.map(f => {
      const newF = { ...f };
      if (newF.options) {
        newF.options = newF.options.map(o => o.trim()).filter(Boolean);
      }
      if (newF.subFields) {
        newF.subFields = newF.subFields.map(sf => {
          const newSf = { ...sf };
          if (newSf.options) {
            newSf.options = newSf.options.map(o => o.trim()).filter(Boolean);
          }
          return newSf;
        });
      }
      return newF;
    });

    const updatedSchema = {
      ...loaderData.schema,
      fields: cleanedFields,
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
      clearDataCache();
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

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => navigate(`/${game}/schemas/${id}/delete`)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Schema
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/${game}/schemas`)} className="w-full sm:w-auto">
              Discard Changes
            </Button>
            <Button type="submit" disabled={submitting || fields.length === 0} className="shadow-lg shadow-orange-500/20 px-8 w-full sm:w-auto">
              {submitting ? "Saving..." : "Save Schema"}
            </Button>
          </div>
        </div>

        {commitError && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
            {commitError}
          </div>
        )}

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
                <div key={index} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm relative group hover:border-blue-400/40 hover:shadow-[0_0_15px_rgba(74,158,255,0.15)] transition-all">
                  
                  {/* Left Column: Identifiers */}
                  <div className="lg:col-span-4 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Display Label</label>
                      <input 
                        value={field.label} 
                        onChange={(e) => handleChangeField(index, 'label', e.target.value)}
                        placeholder="e.g. Max Health" 
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Field Key (Internal)</label>
                      <input 
                        value={field.key} 
                        onChange={(e) => handleChangeField(index, 'key', e.target.value)}
                        placeholder="e.g. max_health" 
                        className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors" 
                      />
                    </div>
                  </div>

                  {/* Middle Column: Type & Unit */}
                  <div className="lg:col-span-3 space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Data Type</label>
                      <div className="relative">
                        {field.type === 'string' && <Type className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        {field.type === 'number' && <Hash className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        {field.type === 'boolean' && <ToggleLeft className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        {field.type === 'list' && <List className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        {field.type === 'enum' && <ListOrdered className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        {field.type === 'abilities' && <Box className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />}
                        <select 
                          value={field.type} 
                          onChange={(e) => handleChangeField(index, 'type', e.target.value)}
                          className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 pl-9 pr-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white transition-colors appearance-none"
                        >
                          <option value="string">Text (String)</option>
                          <option value="number">Number</option>
                          <option value="boolean">Toggle (Boolean)</option>
                          <option value="list">Multiple Select (List)</option>
                          <option value="enum">Single Select (Enum)</option>
                          <option value="abilities">Kit Abilities (Complex List)</option>
                          <option value="object_array">Object Group (Nested List)</option>
                        </select>
                      </div>
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
                        <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Options (One per line)</label>
                        <textarea 
                          value={field.options?.join("\n") || ""} 
                          onChange={(e) => handleChangeField(index, 'options', e.target.value)}
                          placeholder="Tank&#10;Damage&#10;Support"
                          rows={4}
                          className="block w-full rounded-lg border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:text-white resize-none transition-colors" 
                        />
                      </div>
                    ) : (field.type === "abilities" || field.type === "object_array") ? (
                      <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 dark:text-gray-400 text-xs text-center bg-gray-50/50 dark:bg-gray-900/30">
                        {(field.subFields || []).length} custom sub-fields configured
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
                      <label className="flex flex-col items-center gap-1.5 cursor-pointer group/req" title="Required Field">
                        <input 
                          type="checkbox" 
                          checked={field.required} 
                          onChange={(e) => handleChangeField(index, 'required', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                        />
                        <span className="text-[9px] font-bold text-gray-400 group-hover/req:text-gray-600 dark:group-hover/req:text-gray-300 uppercase transition-colors">Req</span>
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
                  {(field.type === "abilities" || field.type === "object_array") && (
                    <div className="col-span-1 lg:col-span-12 border-t border-gray-200 dark:border-gray-800 pt-6 mt-2">
                      <div className="flex flex-col p-5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 text-left">
                        {/* Abilities Standard Definition (Parent) */}
                        {field.type === "abilities" && (
                          <div className="mb-5">
                            <strong className="font-bold flex items-center gap-2 mb-2 text-gray-900 dark:text-gray-100 text-sm"><Box className="w-4 h-4 text-gray-400"/> Complex Field Template</strong>
                            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Automatically embeds a managed Abilities list containing standard properties:</p>
                            <ul className="list-disc pl-5 space-y-1.5 text-xs">
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">Icon Upload</span> <span className="text-gray-400 dark:text-gray-500">(Multi-image capabilities)</span></li>
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">ID</span> <span className="text-gray-400 dark:text-gray-500">(Internal key generation)</span></li>
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">Name</span> <span className="text-gray-400 dark:text-gray-500">(Display label)</span></li>
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">Type</span> <span className="text-gray-400 dark:text-gray-500">(Classification)</span></li>
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">Description</span> <span className="text-gray-400 dark:text-gray-500">(Optional markdown)</span></li>
                              <li><span className="font-medium text-gray-800 dark:text-gray-200">Params</span> <span className="text-gray-400 dark:text-gray-500">(Dynamic key-value parameters defined below)</span></li>
                            </ul>
                          </div>
                        )}
                        
                        {/* Sub Fields Config (Nested Child) */}
                        <div className={field.type === "abilities" ? "ml-0 md:ml-4 bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm border-l-2 border-l-blue-500/50" : "bg-white dark:bg-gray-900/60 p-5 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm"}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                            <div>
                              <span className="block font-bold text-sm text-gray-900 dark:text-gray-100">{field.type === "abilities" ? "Custom Params Sub-Fields" : "Nested Group Sub-Fields"}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{field.type === "abilities" ? "Configure explicit parameters appended to each ability (e.g., Cooldown, Damage)" : "Define the explicit fields that each object in this list will contain."}</span>
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
                                <div key={sIndex} className="flex flex-col sm:flex-row gap-3 items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600">
                                  <input 
                                    className="w-full sm:w-1/3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors" 
                                    placeholder="Label" 
                                    value={subField.label} 
                                    onChange={(e) => handleChangeSubField(index, sIndex, 'label', e.target.value)}
                                  />
                                  <input 
                                    className="w-full sm:w-1/3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-blue-500 transition-colors" 
                                    placeholder="key_internal" 
                                    value={subField.key} 
                                    onChange={(e) => handleChangeSubField(index, sIndex, 'key', e.target.value)}
                                  />
                                  <select 
                                    className="w-full sm:w-1/4 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 transition-colors"
                                    value={subField.type}
                                    onChange={(e) => handleChangeSubField(index, sIndex, 'type', e.target.value)}
                                  >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                  </select>
                                  <button type="button" onClick={() => handleRemoveSubField(index, sIndex)} className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto" title="Remove sub-field">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="py-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/30 dark:bg-gray-800/10">
                              <p className="text-sm font-medium text-gray-500 dark:text-gray-500 opacity-80">No custom sub-fields defined.</p>
                              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 opacity-70">Params will default to a generic JSON object.</p>
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
