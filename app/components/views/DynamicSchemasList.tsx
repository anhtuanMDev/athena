import { Link, useParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { listDirectory } from "~/lib/github";
import { useData } from "~/lib/use-data";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";

export default function SchemasList() {
  const { game } = useParams();

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
  }, [game]);

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
    return <div>Error loading schemas: {(error as Error).message}</div>;

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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              No Schemas Found
            </h3>
            <p className="text-sm text-gray-500 mt-2 mb-4">
              Create your first schema to define data structures for heroes,
              modes, or patches.
            </p>
            <Link to={`/${game}/schemas/new`}>
              <Button>Create Schema</Button>
            </Link>
          </CardContent>
        </Card>
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
                <div className="flex gap-2">
                  <Link
                    to={`/${game}/schemas/${schema.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                  >
                    Edit Schema
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
