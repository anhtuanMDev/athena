import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FormProvider } from "react-hook-form";
import { ArrowLeft, Newspaper } from "lucide-react";
import { Button, ButtonLink } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { useToast } from "~/components/ToastProvider";
import { RecordFields, compact, useRecordForm } from "~/components/views/SchemaRecordForm";
import { createFile, getFile, isConflictError, listDirectory, updateFile } from "~/lib/github";
import { assertSafeGameSlug } from "~/lib/safe-path";
import { useData } from "~/lib/use-data";
import type { DynamicField, DynamicSchemaFile } from "~/schemas/dynamic-schema";

/** Creates a news article, or edits one (/:game/news/:id), in the News schema's form. */
export default function NewsEditor() {
  const { game, "*": splat } = useParams();
  assertSafeGameSlug(game!);
  const idParam = splat?.split("/")[1];
  const id = idParam && idParam !== "new" ? idParam : undefined;
  const navigate = useNavigate();

  const { data, loading, error } = useData(async () => {
    const schemas = await listDirectory<DynamicSchemaFile>(game!, "schemas", true);
    const fields = schemas.filter((s) => s?.category === "news").flatMap((s) => s.fields ?? []);
    const file = id ? await getFile<Record<string, unknown>>(`data/${game}/news/${id}.json`) : null;
    if (id && !file) throw new Error(`News article "${id}" not found.`);
    return { fields, record: file?.content ?? {}, sha: file?.sha };
  }, [game, id], "NewsEditor");

  if (loading) {
    return (
      <div className="w-full py-8 space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-64 bg-border rounded-lg"></div>
        <div className="h-96 bg-border rounded-xl"></div>
      </div>
    );
  }
  if (error) return <LoadErrorState title="Can't Open This Article" error={error} onBack={() => navigate(`/${game}/news`)} />;
  if (!data) return null;

  if (data.fields.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-lg font-semibold text-ink">No News Schema</h3>
          <p className="text-sm text-ink-muted mt-2 mb-4">Create a schema in the News category before adding articles.</p>
          <ButtonLink to={`/${game}/schemas/new`}>Create Schema</ButtonLink>
        </CardContent>
      </Card>
    );
  }

  return <NewsForm key={id ?? "new"} game={game!} id={id} fields={data.fields} record={data.record} sha={data.sha} />;
}

function NewsForm({
  game,
  id,
  fields,
  record,
  sha,
}: {
  game: string;
  id?: string;
  fields: DynamicField[];
  record: Record<string, unknown>;
  sha?: string;
}) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const methods = useRecordForm(fields, record);

  async function save(values: Record<string, unknown>) {
    setSubmitting(true);
    setSubmitError(null);
    const article = compact(values);
    const path = `data/${game}/news/${article.id}.json`;
    try {
      if (id) {
        await updateFile(path, article, sha!, `Update news: ${article.id}`);
      } else {
        if (await getFile(path)) throw new Error(`An article with the id "${article.id}" already exists.`);
        await createFile(path, article, `Add news: ${article.id}`);
      }
      toastSuccess(id ? "Article saved." : "Article published.");
      navigate(`/${game}/news`);
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
                onClick={() => navigate(`/${game}/news`)}
                className="flex items-center text-sm font-medium text-ink-muted hover:text-ink transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to News
              </button>
              <h1 className="text-3xl font-bold text-ink tracking-tight flex items-center gap-3">
                <Newspaper className="w-8 h-8 text-orange-500" />
                {id ? "Edit Article" : "New Article"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {id && (
                <Button type="button" variant="ghost" onClick={() => navigate(`/${game}/news/${id}/delete`)}>
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={submitting} className="shadow-lg px-8">
                {submitting ? "Saving..." : id ? "Save Article" : "Publish Article"}
              </Button>
            </div>
          </div>

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200 border border-red-200 dark:border-red-800/50">
              {submitError}
            </div>
          )}

          <RecordFields
            fields={fields}
            game={game}
            idLocked={!!id}
            idHelp={id ? "The article's file name; it can't change." : "Its file name in the app's data, e.g. season-21-trailer."}
            action="saving"
          />
        </form>
      </FormProvider>
    </div>
  );
}
