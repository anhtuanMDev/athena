import { useState } from "react";
import { FormProvider } from "react-hook-form";

import { useNotifyPlayers } from "~/components/NotifyPlayers";
import { heldId } from "~/lib/record-form";
import { useAutoGenerateId } from "~/lib/use-auto-generate-id";

import { HeroBottomBar } from "./HeroBottomBar";
import { HeroDataTools } from "./HeroDataTools";
import { HeroFormFields } from "./HeroFormFields";
import { HeroReview } from "./HeroReview";
import { HeroTopActions } from "./HeroTopActions";
import { useHeroCommit } from "./hooks/useHeroCommit";
import { useHeroForm } from "./hooks/useHeroForm";
import { useHeroSave } from "./hooks/useHeroSave";

import type { StoredHero } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

interface HeroFormInnerProps {
  game: string;
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  stored?: StoredHero;
  initData: Record<string, unknown>;
  /** An AI import started the form again: its values may be saved untouched, and its id holds. */
  hasImported: boolean;
  onImported: (data: Record<string, unknown>) => void;
}

/**
 * A hero's form: New creates the hero on submit; Edit shows a review of the
 * save first, with the form kept under it as it was left.
 */
export function HeroFormInner({ game, schemas, enums, stored, initData, hasImported, onImported }: HeroFormInnerProps) {
  const form = useHeroForm({ schemas, enums, initData, stored });
  const { methods } = form;
  const { notify: shouldNotify, field: notifyField } = useNotifyPlayers("hero");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const saver = useHeroSave({ game, stored, form, shouldNotify, setSubmitError });
  const committer = useHeroCommit({ game, stored, preview: saver.preview, schema: form.schema, setSubmitError });
  // Edit's id is its file's name; New's follows the name until it's typed, or an AI import gave one.
  useAutoGenerateId(methods, heldId({ storedId: stored?.id, importedId: hasImported ? initData.id : undefined }));
  const actions = { game, stage: stored ? "edit" : "new", isSubmitting: saver.isSubmitting, hasChanges: methods.formState.isDirty || form.picturesEdited || hasImported } as const;
  const closeReview = () => {
    saver.closePreview();
    setSubmitError(null);
  };
  return (
    <>
      {saver.preview && <HeroReview preview={saver.preview} submitError={submitError} isCommitting={committer.isCommitting} onCancel={closeReview} onCommit={committer.commit} />}
      <FormProvider {...methods}>
        <form hidden={saver.preview !== null} onSubmit={methods.handleSubmit(saver.onSubmit)} className="space-y-4">
          {submitError !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{submitError}</div>}
          <HeroTopActions {...actions} />
          {!stored && notifyField}
          <HeroDataTools game={game} schemas={schemas} currentId={stored?.id} form={form} onImported={onImported} />
          <HeroFormFields game={game} stage={actions.stage} form={form} />
          <HeroBottomBar {...actions} />
        </form>
      </FormProvider>
    </>
  );
}
