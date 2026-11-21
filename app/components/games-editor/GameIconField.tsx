import { FormField } from "~/components/FormField";

import { IconPreview } from "./IconPreview";

interface GameIconFieldProps {
  /** The icon field: a URL typed, or a picked file's preview. */
  icon: string;
  error: string | undefined;
  onType: (url: string) => void;
  onPick: (file: File) => void;
}

/** The game's icon: a URL, or a picture picked from the computer, with its preview. */
export function GameIconField({ icon, error, onType, onPick }: GameIconFieldProps) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-1 flex flex-col gap-3">
        <FormField name="icon" label="Icon URL" placeholder="https://..." required={false} error={error !== undefined} helperText={error} value={icon} onChange={(event) => { onType(event.target.value); }} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted uppercase font-medium">Or</span>
          <input
            type="file"
            accept="image/*"
            className="text-xs text-ink-muted file:cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:font-medium file:bg-surface-raised file:text-ink hover:file:bg-gray-200 cursor-pointer"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onPick(file);
              }
            }}
          />
        </div>
      </div>
      <IconPreview icon={icon} />
    </div>
  );
}
