import { Link, useParams, useNavigate } from "react-router";
import { useState } from "react";
import { Button, ButtonLink } from "~/components/ui/button";
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
          <div className="h-8 w-48 bg-border rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-10 w-32 bg-border rounded animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse motion-reduce:animate-none">
              <CardHeader>
                <div className="h-6 w-32 bg-border rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-24 bg-border rounded mb-2" />
                <div className="h-4 w-48 bg-border rounded" />
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
        <h1 className="text-2xl font-bold text-ink capitalize flex items-center gap-2">
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
            <p className="text-sm text-ink-muted mb-4">
              ID: <code className="text-ink">home</code>
            </p>
            <p className="text-sm text-ink-muted mb-4">
              The main landing screen of the mobile app.
            </p>
            <div className="flex gap-2 mt-4">
              <ButtonLink to={`/${game}/layouts/home`} className="w-full">
                <LayoutTemplate aria-hidden="true" className="w-4 h-4" />
                Edit Home Screen
              </ButtonLink>
            </div>
          </CardContent>
        </Card>

        {(!data || data.length === 0) ? (
          <div className="col-span-1 md:col-span-2 lg:col-span-2">
            <EmptyState
              title="No Entity Layouts Available"
              description="You need to create schemas first before you can design their app layouts."
              action={
                <ButtonLink to={`/${game}/schemas/new`}>
                    <Plus aria-hidden="true" className="w-4 h-4" />
                    Create Schema
                  </ButtonLink>
              }
            />
          </div>
        ) : (
          data.map((schema) => (
            <Card key={schema.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink">
                    {schema.name}
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {schema.category}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ink-muted mb-4">
                  ID:{" "}
                  <code className="text-ink">
                    {schema.id}
                  </code>
                </p>
                <p className="text-sm text-ink-muted mb-4">
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
