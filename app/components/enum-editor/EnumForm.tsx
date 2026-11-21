import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";

import { enumFormDefaults } from "~/lib/form-defaults";
import { useAutoGenerateId } from "~/lib/use-auto-generate-id";
import { EnumSchema } from "~/schemas/enum";

import { EnumIdentityFields } from "./EnumIdentityFields";
import { EnumOptions } from "./EnumOptions";
import { EnumReview } from "./EnumReview";
import { EnumSubmitBar } from "./EnumSubmitBar";
import { useEnumCommit } from "./hooks/useEnumCommit";
import { useEnumSave } from "./hooks/useEnumSave";
import { useIconPicks } from "./hooks/useIconPicks";

import type { StoredEnum } from "./types";
import type { GlobalEnum } from "~/schemas/enum";

interface EnumFormProps {
  game: string;
  /** Edit: the enum as loaded. */
  stored?: StoredEnum;
}

const NEW_ENUM: GlobalEnum = { id: "", name: "", description: "", options: [{ id: "", name: "", description: "" }] };

/**
 * An enum's form. New creates it on submit; Edit shows a review of the save
 * first. The form stays mounted under the review, so "Edit Again" finds it
 * as it was left, picked icons and all.
 */
export function EnumForm({ game, stored }: EnumFormProps) {
  const methods = useForm<GlobalEnum>({ resolver: zodResolver(EnumSchema), defaultValues: stored ? enumFormDefaults(stored.content) : NEW_ENUM, mode: stored ? "onChange" : "onSubmit" });
  const options = useFieldArray({ control: methods.control, name: "options" });
  // The options the enum was saved with (their form keys): their ids never follow a label.
  const [loadedOptions] = useState(() => new Set(stored ? options.fields.map((field) => field.id) : []));
  const icons = useIconPicks();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const saver = useEnumSave({ game, stored, keys: options.fields.map((field) => field.id), picks: icons.picks, setSubmitError });
  const committer = useEnumCommit({ game, stored, preview: saver.preview, setSubmitError });
  // Edit's id is its file's name; New's follows the name until it's typed.
  useAutoGenerateId(methods, stored?.id);
  const stage = stored ? "edit" : "new";
  const submitRow = { stage, isSubmitting: saver.isSubmitting, hasChanges: methods.formState.isDirty || Object.keys(icons.picks).length > 0 } as const;
  return (
    <>
      {saver.preview && <EnumReview preview={saver.preview} submitError={submitError} isCommitting={committer.isCommitting} onEditAgain={saver.closePreview} onCommit={committer.commit} />}
      <FormProvider {...methods}>
        <form hidden={saver.preview !== null} onSubmit={methods.handleSubmit(saver.onSubmit, stored && saver.onInvalid)} className="space-y-6">
          {submitError !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/50 dark:text-red-200">{submitError}</div>}
          <EnumSubmitBar place="top" {...submitRow} />
          <EnumIdentityFields stage={stage} />
          <EnumOptions stage={stage} options={options} loadedOptions={loadedOptions} onIconPick={icons.pick} />
          <EnumSubmitBar place="bottom" {...submitRow} />
        </form>
      </FormProvider>
    </>
  );
}
