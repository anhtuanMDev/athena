import { FormProvider } from "react-hook-form";

import { useNotifyPlayers } from "~/components/NotifyPlayers";
import { UnknownKeysNotice } from "~/components/UnknownKeysNotice";
import { DynamicFieldsRenderer } from "~/components/views/DynamicFieldsRenderer";
import { MODE_OWN_KEYS } from "~/lib/form-defaults";
import { heldId } from "~/lib/record-form";
import { unknownKeys } from "~/lib/unknown-keys";
import { useAutoGenerateId } from "~/lib/use-auto-generate-id";

import { useModeForm } from "./hooks/useModeForm";
import { useModeSave } from "./hooks/useModeSave";
import { ModeActions } from "./ModeActions";
import { ModeDataTools } from "./ModeDataTools";
import { ModeDeleteButton } from "./ModeDeleteButton";
import { ModeIdentityFields } from "./ModeIdentityFields";
import { ModeSaveError } from "./ModeSaveError";

import type { StoredMode } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";
import type { GlobalEnum } from "~/schemas/enum";

interface ModeFormInnerProps {
  game: string;
  schemas: DynamicSchemaFile[];
  enums: GlobalEnum[];
  stored?: StoredMode;
  initData: Record<string, unknown>;
  /** An AI import started the form again: Save may write it even untouched. */
  hasImported: boolean;
  onImported: (data: Record<string, unknown>) => void;
}

/** A mode's form: its name, description and id, its schema's fields, and saving it. */
export function ModeFormInner({ game, schemas, enums, stored, initData, hasImported, onImported }: ModeFormInnerProps) {
  const form = useModeForm({ schemas, enums, initData });
  const { methods } = form;
  const { notify: shouldNotify, field: notifyField } = useNotifyPlayers("mode");
  const saver = useModeSave({ game, stored, methods, fields: form.fields, schema: form.schema, abilityIcons: form.abilityIcons, shouldNotify });
  // Edit's id is its file's name; New's follows the name until it's typed, or an AI import gave one.
  useAutoGenerateId(methods, heldId({ storedId: stored?.id, importedId: hasImported ? initData.id : undefined }));
  const stage = stored ? "edit" : "new";
  const hasChanges = methods.formState.isDirty || form.picturesEdited || hasImported;
  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(saver.onSubmit, saver.onInvalid)} className="space-y-4">
        <ModeSaveError message={saver.submitError} />
        {stored && <UnknownKeysNotice keys={unknownKeys(initData, form.schema)} rawEditor={`/${game}/raw/modes/${String(initData.id)}`} />}
        <ModeActions game={game} stage={stage} isSubmitting={saver.isSubmitting} hasChanges={hasChanges} />
        {!stored && notifyField}
        <ModeDataTools game={game} schemas={schemas} currentId={stored?.id} form={form} onImported={onImported} />
        <ModeIdentityFields stage={stage} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <DynamicFieldsRenderer
            fields={form.fields}
            game={game}
            abilityIcons={form.abilityIcons}
            setAbilityIcons={form.setAbilityIcons}
            control={methods.control}
            register={methods.register}
            errors={methods.formState.errors}
            skipFields={MODE_OWN_KEYS}
          />
        </div>
        {stored && <ModeDeleteButton game={game} id={String(initData.id)} isSubmitting={saver.isSubmitting} />}
      </form>
    </FormProvider>
  );
}
