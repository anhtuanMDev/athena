import { Link, useParams } from "react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { listDirectory } from "~/lib/github";
import { useData } from "~/lib/use-data";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { Plus, FileJson, Copy, Check, Download } from "lucide-react";
import { EmptyState } from "~/components/ui/EmptyState";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

export default function SchemasList() {
  const { game } = useParams();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const exportCopy = async (schema: DynamicSchemaFile) => {
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    setCopiedId(schema.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportDownload = (schema: DynamicSchemaFile) => {
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${schema.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data, loading, error } = useData(async () => {
    try {
      // For Phase 1, we expect schemas to be stored in data/<game>/schemas/<id>.json
      // Fetch schemas directly from the worker with includeContent=true
      const schemas = await listDirectory<DynamicSchemaFile>(
        game!,
        "schemas",
        true,
      );
      return schemas;
    } catch (e) {
      // If folder doesn't exist yet, return empty array
      return [];
    }
  }, [game], `${game}-schema-list`);

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-2" />
                <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  if (error)
    return (
      <LoadErrorState
        title="Failed to Load Schemas"
        error={error}
        onBack={() => window.history.back()}
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
          Schemas - {game}
        </h1>
        <Link to={`/${game}/schemas/new`}>
          <Button>Create Schema</Button>
        </Link>
      </div>

      {!data || data.length === 0 ? (
        <EmptyState
          title="No Schemas Found"
          description="Create your first schema to define data structures for heroes, modes, or patches."
          action={
            <Link to={`/${game}/schemas/new`}>
              <Button className="shadow-lg shadow-orange-500/20">
                <Plus className="w-4 h-4 mr-2" />
                Create Schema
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((schema) => (
            <Card key={schema.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {schema.name}
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {schema.category}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                  ID:{" "}
                  <code className="text-gray-700 dark:text-gray-300">
                    {schema.id}
                  </code>
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {schema.fields?.length || 0} fields configured
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/${game}/schemas/${schema.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                  >
                    Edit Schema
                  </Link>
                  <span className="text-gray-300 dark:text-gray-700">•</span>
                  <Link
                    to={`/${game}/layouts/${schema.id}`}
                    className="text-sm text-orange-600 hover:text-orange-800 dark:text-orange-400 font-medium flex items-center gap-1"
                  >
                    Edit App Layout
                  </Link>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => exportCopy(schema)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                  >
                    {copiedId === schema.id
                      ? <Check className="w-3.5 h-3.5" />
                      : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === schema.id ? "Copied!" : "Copy JSON"}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportDownload(schema)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .json
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
