import { Link, useParams, useNavigate } from "react-router";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { listDirectory } from "~/lib/github";
import { useData } from "~/lib/use-data";
import { type DynamicSchemaFile } from "~/schemas/dynamic-schema";
import { Plus, LayoutTemplate, Smartphone } from "lucide-react";
import { EmptyState } from "~/components/ui/EmptyState";
import { LoadErrorState } from "~/components/ui/LoadErrorState";

export default function LayoutsList() {
  const { game } = useParams();
  const navigate = useNavigate();



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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-orange-500" /> App Layouts - {game}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="border-blue-500/30 bg-blue-50/10 dark:bg-blue-900/10 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-500" />
                Home Screen
              </h2>
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                global
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              ID: <code className="text-gray-700 dark:text-gray-300">home</code>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              The main landing screen of the mobile app.
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                type="button"
                onClick={() => navigate(`/${game}/layouts/home`)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <LayoutTemplate className="w-4 h-4 mr-2" />
                Edit Home Screen
              </Button>
            </div>
          </CardContent>
        </Card>

        {(!data || data.length === 0) ? (
          <div className="col-span-1 md:col-span-2 lg:col-span-2">
            <EmptyState
              title="No Entity Layouts Available"
              description="You need to create schemas first before you can design their app layouts."
              action={
                <Link to={`/${game}/schemas/new`}>
                  <Button className="shadow-lg shadow-orange-500/20">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Schema
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          data.map((schema) => (
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
                <div className="flex gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(`/${game}/layouts/${schema.id}`)}
                    className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-900/20"
                  >
                    <LayoutTemplate className="w-4 h-4 mr-2" />
                    Edit App Layout
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
