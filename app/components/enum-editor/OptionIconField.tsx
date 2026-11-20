import { Controller, useFormContext } from "react-hook-form";

import { ImageUploadField } from "~/components/ImageUploadField";

import { optionPath } from "./utils/fieldPaths";

import type { PickedIcon } from "~/lib/enum-icons";
import type { GlobalEnum } from "~/schemas/enum";

interface OptionIconFieldProps {
  index: number;
  fieldKey: string;
  onIconPick: (key: string, file: PickedIcon | null) => void;
}

/** An option's icon: one picked is kept by the option's key; one removed clears the option's icon. */
export function OptionIconField({ index, fieldKey, onIconPick }: OptionIconFieldProps) {
  const { control } = useFormContext<GlobalEnum>();
  return (
    <div>
      <Controller
        control={control}
        name={optionPath(index, "icon")}
        render={({ field }) => (
          <ImageUploadField
            label="Icon (Optional)"
            defaultPreview={field.value}
            onFileSelect={(file) => {
              onIconPick(fieldKey, file);
              if (!file) {
                field.onChange("");
              }
            }}
          />
        )}
      />
    </div>
  );
}
