import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FormProvider } from "react-hook-form";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button, ButtonLink } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { useToast } from "~/components/ToastProvider";
import { RecordFields, compact, useRecordForm } from "~/components/views/SchemaRecordForm";
import { createFile, getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { schemaOf } from "~/lib/record-schema";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useCategories } from "~/lib/categories-context";
import { useData } from "~/lib/use-data";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

/**
 * Creates a record, or edits one (/:game/{folder}/:id), of a category without
 * a form of its own (news, patches, items), in its schema's form.
 */
export default function RecordEditor({ category, noun, icon }: { category: string; noun: string; icon: LucideIcon }) {
  const { game, "*": splat } = useParams();
  assertSafeGameSlug(game!);
  const idParam = splat?.split("/")[1];
  const id = idParam && idParam !== "new" ? idParam : undefined;
  const navigate = useNavigate();
  const { folder } = useCategories().find((c) => c.category === category)!;

  const { data, loading, error } = useData(async () => {
    const schemas = (await listDirectory<DynamicSchemaFile>(game!, "schemas", true)).filter((s) => s?.category === category);
    const file = id ? await getFile<Record<string, unknown>>(`data/${game}/${folder}/${id}.json`) : null;
    if (id && !file) throw new Error(`${noun} "${id}" not found.`);
    return { schemas, record: file?.content ?? {}, sha: file?.sha };
  }, [game, category, id], "RecordEditor");

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-64 bg-border rounded-lg"></div>
        <div className="h-96 bg-border rounded-xl"></div>
      </div>
    );
  }
  if (error) return <LoadErrorState title={`Can't Open This ${noun}`} error={error} onBack={() => navigate(`/${game}/${folder}`)} />;
  if (!data) return null;

  if (data.schemas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-lg font-semibold text-ink">No {noun} Schema</h3>
          <p className="text-sm text-ink-muted mt-2 mb-4">Create a schema in this category before adding records.</p>
          <ButtonLink to={`/${game}/schemas/new`}>Create Schema</ButtonLink>
        </CardContent>
      </Card>
    );
  }

  return (
    <RecordForm
      key={id ?? "new"}
      game={game!}
      category={category}
      folder={folder}
      noun={noun}
      icon={icon}
      id={id}
      schemas={data.schemas}
      record={data.record}
      sha={data.sha}
    />
  );
}

function RecordForm({
  game,
  category,
  folder,
  noun,
  icon: Icon,
  id,
  schemas,
  record,
  sha,
}: {
  game: string;
  category: string;
  folder: string;
  noun: string;
  icon: LucideIcon;
  id?: string;
  schemas: DynamicSchemaFile[];
  record: Record<string, unknown>;
  sha?: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The record keeps the schema it follows, as hero and mode records and imports do.
  const [schemaId, setSchemaId] = useState(() => schemaOf(schemas, record.schema_id)!.id);
  const fields = schemaOf(schemas, schemaId)?.fields ?? [];
  const methods = useRecordForm(fields, { ...record, schema_id: schemaId });

  async function save(values: Record<string, unknown>) {
    setSubmitting(true);
    setSubmitError(null);
    const saved = compact(values);
    const path = `data/${game}/${folder}/${saved.id}.json`;
    try {
      if (id) {
        await updateFile(path, saved, sha!, `Update ${category}: ${saved.id}`);
      } else {
        if (await getFile(path)) throw new Error(`A ${noun.toLowerCase()} with the id "${saved.id}" already exists.`);
        await createFile(path, saved, `Add ${category}: ${saved.id}`);
      }
      toastSuccess(id ? `${noun} saved.` : `${noun} published.`);
      navigate(`/${game}/${folder}`);
    } catch (err) {
      const message = isConflictError(err) ? err.message : (err as Error).message;
      setSubmitError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full py-8 pb-32">
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(save)} className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => navigate(`/${game}/${folder}`)}
                className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
                <Icon className="w-8 h-8 text-orange-500" />
                {id ? `Edit ${noun}` : `New ${noun}`}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {id && (
                <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/${folder}/${id}/delete`)}>
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={submitting} className="shadow-lg px-8">
                {submitting ? "Saving..." : id ? `Save ${noun}` : `Publish ${noun}`}
              </Button>
            </div>
          </div>

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
              {submitError}
            </div>
          )}

          {schemas.length > 1 && (
            <label className="block max-w-md text-sm font-medium text-ink">
              Schema
              <select
                value={schemaId}
                onChange={(e) => {
                  setSchemaId(e.target.value);
                  methods.setValue("schema_id", e.target.value, { shouldDirty: true });
                }}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
              >
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </option>
                ))}
              </select>
            </label>
          )}

          <RecordFields
            fields={fields}
            game={game}
            idLocked={!!id}
            idHelp={id ? `The ${noun.toLowerCase()}'s file name; it can't change.` : "Its file name in the app's data, e.g. season-21-trailer."}
            action="saving"
          />
        </form>
      </FormProvider>
    </div>
  );
}
