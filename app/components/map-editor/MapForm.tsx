import { useState } from "react";
import { FormProvider } from "react-hook-form";

import { useNotifyPlayers } from "~/components/NotifyPlayers";
import { UnknownKeysNotice } from "~/components/UnknownKeysNotice";
import { mapStartingValues } from "~/lib/map-form";
import { heldId } from "~/lib/record-form";
import { unknownKeys } from "~/lib/unknown-keys";
import { useAutoGenerateId } from "~/lib/use-auto-generate-id";

import { useMapForm } from "./hooks/useMapForm";
import { useMapSave } from "./hooks/useMapSave";
import { MapActions } from "./MapActions";
import { MapDeleteButton } from "./MapDeleteButton";
import { MapFields } from "./MapFields";
import { MapSaveError } from "./MapSaveError";

import type { StoredMap } from "./types";
import type { DynamicSchemaFile } from "~/schemas/dynamic-schema";

interface MapFormProps {
  game: string;
  schemas: DynamicSchemaFile[];
  stored?: StoredMap;
}

/** A map's form: its name and id, its schema's fields, and saving it; Edit's way to delete it under the form. */
export function MapForm({ game, schemas, stored }: MapFormProps) {
  const [initData] = useState(() => mapStartingValues(game, schemas, stored?.content));
  const form = useMapForm({ schemas, initData });
  const { methods } = form;
  const { notify: shouldNotify, field: notifyField } = useNotifyPlayers("map");
  const saver = useMapSave({ game, stored, schema: form.schema, shouldNotify });
  // Edit's id is its file's name; New's follows the name until it's typed.
  useAutoGenerateId(methods, heldId({ storedId: stored?.id }));
  const stage = stored ? "edit" : "new";
  const actions = { game, stage, isSubmitting: saver.isSubmitting, hasChanges: methods.formState.isDirty, isValid: methods.formState.isValid } as const;
  return (
    <>
      <MapSaveError message={saver.submitError} />
      {stored && <UnknownKeysNotice keys={unknownKeys(stored.content, form.schema)} rawEditor={`/${game}/raw/maps/${stored.id}`} className="mb-4" />}
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(saver.onSubmit)} className="space-y-5">
          <MapActions {...actions} place="top" />
          {!stored && notifyField}
          <MapFields game={game} stage={stage} schemas={schemas} form={form} />
          <MapActions {...actions} place="bottom" />
        </form>
      </FormProvider>
      {stored && <MapDeleteButton game={game} id={stored.id} isSubmitting={saver.isSubmitting} />}
    </>
  );
}
