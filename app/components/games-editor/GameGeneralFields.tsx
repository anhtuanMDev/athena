import { FormField } from "~/components/FormField";

import type { useGameDraft } from "./hooks/useGameDraft";
import type { GameFormMode } from "./types";

interface GameGeneralFieldsProps {
  mode: GameFormMode;
  form: ReturnType<typeof useGameDraft>;
  errorOf: (field: string) => string | undefined;
}

/** A slug typed as one: lowercase letters, digits and dashes. */
const asSlug = (value: string) => value.toLowerCase().replaceAll(/[^a-z0-9-]/g, "-");

/** The game's slug, name and developer. */
export function GameGeneralFields({ mode, form, errorOf }: GameGeneralFieldsProps) {
  const { draft, update } = form;
  const slugHelp = mode === "edit" ? `Can't be changed: it names the game's data (data/${draft.slug}/).` : "Can't be changed once the game is added: it names the game's data folder.";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-ink">General Information</h3>
        <p className="text-xs text-ink-muted mb-4">Core details about the game.</p>
      </div>
      <div className="flex flex-col gap-5">
        <FormField
          name="slug"
          label="Slug"
          placeholder="e.g. overwatch"
          value={draft.slug}
          // The slug names the game's data folder; nothing moves it, so it can't change.
          slotProps={{ htmlInput: { readOnly: mode === "edit" } }}
          error={errorOf("slug") !== undefined}
          helperText={errorOf("slug") ?? slugHelp}
          onChange={(event) => { update({ slug: asSlug(event.target.value) }); }}
        />
        <FormField name="name" label="Name" placeholder="e.g. Overwatch 2" error={errorOf("name") !== undefined} helperText={errorOf("name")} value={draft.name} onChange={(event) => { update({ name: event.target.value }); }} />
        <FormField name="developer" label="Developer" placeholder="e.g. Blizzard Entertainment" required={false} value={draft.developer} onChange={(event) => { update({ developer: event.target.value }); }} />
      </div>
    </div>
  );
}
