import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Plus, Settings2, Trash2, LayoutTemplate, Save, Server } from "lucide-react";
import { useToast } from "~/components/ToastProvider";
import { Button } from "~/components/ui/button";
import { getFile, updateFile, createFile, isConflictError } from "~/lib/github";
import { useData, clearDataCache } from "~/lib/use-data";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { EmptyState } from "~/components/ui/EmptyState";

const PRIMITIVE_TYPES = [
  "image_hero",
  "image_grid",
  "title",
  "stat_grid",
  "progress_bar",
  "icon_grid",
  "tag_list",
  "long_text",
  "key_value_list",
  "related_list",
  "section_header",
  "connector_annotation"
];

export default function LayoutEdit() {
  const { game, "*": splat } = useParams();
  const id = splat?.split("/")[1];
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const { data: loaderData, loading, error: loadError } = useData(
    async () => {
      if (!id) throw new Error("Schema ID missing");
      // Load Schema
      let schemaFile;
      if (id === "home") {
        schemaFile = { content: { name: "Home Screen", category: "global", fields: [] } };
      } else {
        schemaFile = await getFile(`data/${game}/schemas/${id}.json`);
        if (!schemaFile) throw new Error("Base Schema not found");
      }

      // Load Layout (may not exist yet)
      let layoutData: Record<string, any> | null = null;
      let layoutSha: string | undefined = undefined;
      try {
        const layoutFile = await getFile(`data/${game}/layouts/${id}.json`);
        if (layoutFile) {
          layoutData = layoutFile.content as Record<string, any>;
          layoutSha = layoutFile.sha;
        }
      } catch (err) {
        // Not found is fine, we'll create it
      }

      return {
        schema: schemaFile.content as Record<string, any>,
        layoutData,
        layoutSha
      };
    },
    [game, id],
    `${game}-layout-${id}`
  );

  const [sections, setSections] = useState<any[]>([]);
  const [schemaVersion, setSchemaVersion] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loaderData?.layoutData) {
      setSections(loaderData.layoutData.sections || []);
      setSchemaVersion(loaderData.layoutData.schemaVersion || 1);
    }
  }, [loaderData]);

  const addSection = (type: string) => {
    setSections([
      ...sections,
      { id: `sec_${Date.now()}`, type, props: {}, visible: true }
    ]);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter(s => s.id !== id));
  };

  const updateSectionProps = (id: string, propsStr: string) => {
    try {
      const parsedProps = JSON.parse(propsStr);
      setSections(sections.map(s => s.id === id ? { ...s, props: parsedProps } : s));
    } catch(e) {
      // Ignore invalid JSON while typing
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaderData) return;
    setSubmitting(true);

    const newLayout = {
      schemaVersion,
      gameId: game,
      category: loaderData.schema.category,
      sections
    };

    try {
      if (loaderData.layoutSha) {
        await updateFile(
          `data/${game}/layouts/${id}.json`,
          newLayout,
          loaderData.layoutSha,
          `Update layout for schema: ${id}`
        );
      } else {
        await createFile(
          `data/${game}/layouts/${id}.json`,
          newLayout,
          `Create layout for schema: ${id}`
        );
      }
      toastSuccess(`Layout for ${id} updated successfully!`);
      clearDataCache();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
      </div>
    );
  }

  if (loadError) {
    return <LoadErrorState title="Failed to Load Data" error={loadError} onBack={() => navigate(`/${game}/schemas`)} />;
  }

  if (!loaderData) return null;

  return (
    <div className="w-full py-8 pb-32">
      <form onSubmit={handleCommit} className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate(`/${game}/schemas`)} className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-2">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Schemas
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              <LayoutTemplate className="w-8 h-8 text-blue-500" />
              Layout Builder: {loaderData.schema.name}
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" disabled={submitting} className="shadow-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="w-4 h-4 mr-2" />
              {submitting ? "Saving..." : "Save Layout"}
            </Button>
          </div>
        </div>

        <div className="flex gap-8 items-start justify-center">
          {/* Mobile Canvas */}
          <div className="w-[393px] h-[852px] bg-gray-50 dark:bg-[#0B1324] border-12 border-gray-900 rounded-[3rem] overflow-y-auto shadow-2xl shrink-0 flex flex-col relative custom-scrollbar">
            {/* Phone Notch */}
            <div className="sticky top-0 inset-x-0 h-7 bg-gray-900 rounded-b-3xl mx-auto w-40 z-10 mb-2"></div>
            
            <div className="p-4 space-y-4 flex-1 pb-12">
              {sections.length === 0 ? (
                 <div className="text-center py-32 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl mx-4">
                   <LayoutTemplate className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                   <p className="text-sm">Add layout blocks</p>
                 </div>
              ) : (
                sections.map((section, idx) => (
                  <div key={section.id} className="p-3 border rounded-xl bg-white dark:bg-gray-900/50 shadow-sm border-gray-200 dark:border-gray-800 relative group">
                    <div className="flex justify-between items-center mb-2 pb-2">
                      <span className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                        {idx + 1}. {section.type}
                      </span>
                      <button type="button" onClick={() => removeSection(section.id)} className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <textarea 
                        className="w-full font-mono text-[11px] p-2 rounded border bg-gray-50 dark:bg-gray-950 dark:border-gray-800 text-gray-800 dark:text-gray-300 focus:ring-1 focus:ring-blue-500 outline-none"
                        rows={3}
                        defaultValue={JSON.stringify(section.props, null, 2)}
                        onChange={(e) => updateSectionProps(section.id, e.target.value)}
                        placeholder="Props (JSON)"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Home Bar */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
          </div>

          {/* Sidebar Tools */}
          <div className="w-64 shrink-0 space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                <Plus className="w-4 h-4" /> Add Block
              </h3>
              <div className="space-y-2">
                {PRIMITIVE_TYPES.map(type => (
                  <button 
                    key={type} 
                    type="button"
                    onClick={() => addSection(type)} 
                    className="w-full text-left px-3 py-2 text-sm font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-bold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                 <Server className="w-4 h-4" /> Available Fields
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(loaderData.schema.fields || []).map((f: any) => (
                  <div key={f.key} className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                    {f.key} <span className="text-gray-400 dark:text-gray-600">({f.type})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
