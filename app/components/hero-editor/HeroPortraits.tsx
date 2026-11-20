import { useFormContext } from "react-hook-form";

import { FormField } from "~/components/FormField";
import { MultiImageUploadField } from "~/components/MultiImageUploadField";

import type { ImageEntry } from "~/components/MultiImageUploadField";
import type { EntriesUpdate } from "~/lib/image-entries";

interface HeroPortraitsProps {
  portraits: ImageEntry[];
  onChange: (update: EntriesUpdate) => void;
}

/** The hero's portraits, by key; without any, a URL may be typed instead. */
export function HeroPortraits({ portraits, onChange }: HeroPortraitsProps) {
  const { register, formState: { errors } } = useFormContext<Record<string, unknown>>();
  const message = errors.portrait?.message;
  return (
    <div className="border border-border p-4 rounded-xl bg-surface-raised">
      <MultiImageUploadField label="Portraits" entries={portraits} onChange={onChange} defaultKey="main" />
      {portraits.length === 0 && (
        <div className="mt-4">
          <FormField label="Or Image URL" placeholder="https://..." {...register("portrait")} error={errors.portrait !== undefined} helperText={typeof message === "string" ? message : undefined} />
        </div>
      )}
    </div>
  );
}
